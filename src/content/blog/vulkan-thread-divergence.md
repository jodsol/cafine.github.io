---
title: "GPU에서 if문은 정말 느릴까? - Vulkan으로 검증하는 Thread Divergence"
description: "Vulkan compute shader와 timestamp query로 branch 자체의 비용과 warp/subgroup 내부 thread divergence의 비용을 나누어 측정합니다."
pubDate: 2026-06-07
category: "GPU Architecture Lab"
tags: ["GPU", "Vulkan", "Compute Shader"]
---

### 질문: GPU에서 if문은 정말 느릴까?

GPU 최적화 이야기를 하다 보면 이런 말을 자주 듣습니다.

```text
GPU에서 if문은 느리다.
```

그런데 정말 `if`문 자체가 문제일까요?

아니면 같은 warp/subgroup 안의 thread들이 서로 다른 branch를 타는 것이 문제일까요?

이번 글의 핵심 질문은 이것입니다.

> Branch 자체가 느린가, Divergence가 느린가?

이 질문은 생각보다 중요합니다. 만약 branch 자체가 문제라면 shader에서 `if`를 최대한 없애야 합니다. 하지만 divergence가 문제라면 최적화 방향은 달라집니다. `if`를 없애는 것보다, 같은 warp/subgroup 안의 lane들이 같은 실행 경로를 타도록 데이터를 정렬하는 것이 더 중요합니다.

### 문제: GPU는 thread를 하나씩 실행하지 않는다

CPU 관점에서 보면 thread 하나가 `if`를 만나고 조건에 따라 한쪽 경로만 실행하는 것이 자연스럽습니다.

하지만 GPU는 보통 여러 lane을 warp 또는 subgroup 단위로 묶어서 실행합니다.

```text
Workgroup
  - Subgroup 0: lane 0~31
  - Subgroup 1: lane 32~63
  - ...
```

NVIDIA에서는 보통 warp 크기가 32입니다. Vulkan에서는 더 일반적으로 subgroup이라고 부르며, 실제 subgroup 크기는 GPU와 드라이버에 따라 달라질 수 있습니다.

문제는 같은 subgroup 안에서 lane들이 서로 다른 branch를 타는 경우입니다.

```text
Subgroup 0

lane 0 -> if
lane 1 -> else
lane 2 -> if
lane 3 -> else
...
```

이때 GPU는 두 경로를 완전히 독립적으로 동시에 실행하지 못하는 경우가 많습니다. 보통 한쪽 경로를 실행하는 동안 다른 쪽 lane은 비활성화되고, 그 다음 반대쪽 경로를 실행합니다.

```text
1. if 경로 실행
   else lane은 비활성

2. else 경로 실행
   if lane은 비활성
```

결과적으로 같은 명령을 실행하는 동안 일부 lane이 놀게 됩니다. 이 현상을 thread divergence 또는 branch divergence라고 부릅니다.

### 가설

이번 실험의 예상은 다음과 같습니다.

```text
No Branch
~= Uniform Branch
~= Subgroup Coherent Branch
<
Divergent Branch
```

조금 더 풀어 쓰면 이렇습니다.

```text
Branch 자체는 큰 문제가 아닐 수 있다.

문제는 같은 subgroup 안에서
lane들이 서로 다른 branch 방향으로 갈라지는 것이다.
```

즉 우리가 확인하려는 것은 단순히 `if`가 있는지 없는지가 아닙니다. 같은 subgroup 안에서 실행 흐름이 얼마나 정렬되어 있는지가 핵심입니다.

### 실험 설계

같은 입력 크기, 같은 dispatch 구조에서 branch 패턴만 바꿉니다.

실험은 Vulkan compute shader로 작성하고, GPU 시간은 timestamp query로 측정합니다.

```powershell
.\VulkanEngine.exe thread-divergence
```

입력 크기와 반복 횟수는 동일하게 둡니다.

```text
Element count: 262144
Iteration count: 1024
```

각 shader는 `heavyA`, `heavyB`라는 계산 경로를 사용합니다. 두 함수는 비슷한 양의 ALU 작업을 수행하도록 만들고, branch 패턴만 다르게 구성합니다.

### Case A. No Branch

기준값입니다. branch 없이 한쪽 계산만 실행합니다.

```glsl
result = heavyA(x, iterationCount);
```

이 케이스는 이후 결과를 비교하기 위한 baseline입니다.

### Case B. Uniform Branch

branch는 있지만 모든 invocation이 같은 경로를 탑니다.

```glsl
if (mode == 0u) {
    result = heavyA(x, iterationCount);
} else {
    result = heavyB(x, iterationCount);
}
```

이 경우 `if`문은 존재하지만 subgroup 안에서 lane들이 갈라지지 않습니다. 모든 lane이 같은 조건값을 보고 같은 경로를 실행합니다.

### Case C. Subgroup Coherent Branch

subgroup 단위로 branch 방향을 정렬합니다.

```glsl
if ((gl_SubgroupID & 1u) == 0u) {
    result = heavyA(x, iterationCount);
} else {
    result = heavyB(x, iterationCount);
}
```

workgroup 안의 subgroup마다 서로 다른 branch를 탈 수는 있습니다. 하지만 같은 subgroup 안에서는 모든 lane이 같은 경로를 탑니다.

즉 divergence가 workgroup 수준에서는 있어도, subgroup 내부에는 없습니다.

`gl_SubgroupID`를 쓰지 않고 NVIDIA warp 크기 32를 가정해 설명하면 다음과 비슷한 패턴입니다.

```glsl
uint warpGroup = id / 32u;

if ((warpGroup & 1u) == 0u) {
    result = heavyA(x, iterationCount);
} else {
    result = heavyB(x, iterationCount);
}
```

단, Vulkan에서 일반적인 실험을 할 때는 실제 subgroup 크기가 항상 32라고 단정하지 않는 편이 좋습니다.

### Case D. Divergent Branch

같은 subgroup 안에서 lane들이 서로 다른 경로를 타게 만듭니다.

```glsl
if ((gl_SubgroupInvocationID & 1u) == 0u) {
    result = heavyA(x, iterationCount);
} else {
    result = heavyB(x, iterationCount);
}
```

이 패턴은 subgroup 내부에서 짝수 lane과 홀수 lane을 갈라놓습니다.

```text
lane 0 -> heavyA
lane 1 -> heavyB
lane 2 -> heavyA
lane 3 -> heavyB
...
```

따라서 GPU는 `heavyA` 경로와 `heavyB` 경로를 모두 처리해야 하고, 각 경로를 실행하는 동안 반대쪽 lane은 비활성화될 가능성이 큽니다.

### Local Size

각 branch pattern은 네 가지 `local_size_x`에서 측정합니다.

```text
local_size_x = 32
local_size_x = 64
local_size_x = 128
local_size_x = 256
```

여기서 중요한 점은 divergence의 핵심 단위가 workgroup 전체가 아니라 subgroup 내부라는 것입니다.

`local_size_x = 256`이면 workgroup 하나에 더 많은 invocation이 들어갑니다. NVIDIA 기준으로 보면 32-lane warp 8개에 해당합니다. 하지만 divergence 여부는 결국 같은 subgroup 안의 lane들이 같은 branch를 타는지로 결정됩니다.

따라서 다음 패턴은 local size가 커져도 각 subgroup 내부에서 계속 갈라집니다.

```glsl
if ((gl_SubgroupInvocationID & 1u) == 0u)
```

반대로 다음처럼 subgroup 또는 warp 단위로 branch 방향을 정렬하면, workgroup 안에 여러 subgroup이 있더라도 각 subgroup 내부에서는 coherent하게 실행될 수 있습니다.

```glsl
if ((gl_SubgroupID & 1u) == 0u)
```

### 결과

Vulkan timestamp query로 측정한 GPU 시간입니다.

| Case | Branch Pattern | Local Size | GPU Time (ms) | 해석 |
| --- | --- | ---: | ---: | --- |
| A | No Branch | 32 | 0.3436 | 기준 |
| A | No Branch | 64 | 0.5746 | 기준 |
| A | No Branch | 128 | 0.3297 | 기준 |
| A | No Branch | 256 | 0.3226 | 기준 |
| B | Uniform Branch | 32 | 0.3318 | 모든 lane이 같은 경로 |
| B | Uniform Branch | 64 | 0.7127 | 모든 lane이 같은 경로 |
| B | Uniform Branch | 128 | 0.3256 | 모든 lane이 같은 경로 |
| B | Uniform Branch | 256 | 0.3226 | 모든 lane이 같은 경로 |
| C | Subgroup Coherent | 32 | 0.3318 | subgroup 내부 divergence 없음 |
| C | Subgroup Coherent | 64 | 0.3328 | subgroup 내부 divergence 없음 |
| C | Subgroup Coherent | 128 | 0.3287 | subgroup 내부 divergence 없음 |
| C | Subgroup Coherent | 256 | 0.3277 | subgroup 내부 divergence 없음 |
| D | Divergent Branch | 32 | 0.6676 | subgroup 내부 lane 분기 |
| D | Divergent Branch | 64 | 0.6513 | subgroup 내부 lane 분기 |
| D | Divergent Branch | 128 | 0.6513 | subgroup 내부 lane 분기 |
| D | Divergent Branch | 256 | 0.6474 | subgroup 내부 lane 분기 |

단일 실행 snapshot이므로 일부 값에는 흔들림이 있습니다. 특히 이 실행에서는 `local_size_x = 64`의 no-branch와 uniform branch 값이 주변 값보다 높게 나왔습니다.

하지만 전체 패턴은 명확합니다.

```text
No Branch / Uniform / Coherent
  대체로 0.32 ~ 0.34 ms

Divergent
  대체로 0.65 ms
```

subgroup 안에서 lane들이 갈라지는 divergent branch는 대략 2배에 가까운 시간이 걸렸습니다.

### 분석: if문이 아니라 실행 흐름의 불일치가 문제다

결과에서 가장 먼저 봐야 할 것은 uniform branch입니다.

```text
Uniform Branch
```

이 케이스에는 분명히 `if`문이 있습니다. 하지만 모든 invocation이 같은 branch를 탑니다. 따라서 subgroup 내부에서 lane들이 갈라지지 않습니다.

결과도 no-branch와 거의 비슷합니다.

즉 이 실험에서는 branch 자체의 비용이 크지 않았습니다.

다음은 subgroup coherent branch입니다.

```text
Subgroup Coherent Branch
```

이 케이스에서는 subgroup마다 서로 다른 경로를 탈 수 있습니다. 하지만 같은 subgroup 안에서는 모든 lane이 같은 경로를 탑니다.

그래서 실행 효율이 크게 무너지지 않습니다. workgroup 전체 관점에서는 branch가 섞여 있어도, GPU가 실제로 묶어서 실행하는 단위인 subgroup 내부에서는 흐름이 정렬되어 있기 때문입니다.

반면 divergent branch는 다릅니다.

```text
Divergent Branch
```

같은 subgroup 안에서 짝수 lane과 홀수 lane이 서로 다른 경로를 탑니다. 이 경우 GPU는 `heavyA` 경로와 `heavyB` 경로를 모두 처리해야 하고, 각 경로를 실행하는 동안 반대쪽 lane은 비활성화됩니다.

그래서 같은 양의 데이터를 처리하더라도 실행 시간이 늘어납니다.

### local_size를 어떻게 봐야 할까?

`local_size_x`는 workgroup 하나에 들어가는 invocation 수입니다.

```text
local_size_x = 32
local_size_x = 256
```

두 설정은 workgroup 크기가 다릅니다. 하지만 divergence의 핵심 단위는 workgroup 전체가 아니라 subgroup입니다.

NVIDIA 기준으로 설명하면 다음과 같습니다.

```text
local_size_x = 32
  -> warp 1개

local_size_x = 256
  -> warp 8개
```

하지만 `id % 2` 또는 `gl_SubgroupInvocationID & 1u` 같은 패턴은 각 warp/subgroup 내부에서 계속 lane을 갈라놓습니다. local size가 커진다고 divergence가 자동으로 사라지지 않습니다.

반대로 `id / 32`처럼 warp 단위로 branch를 정렬하거나, Vulkan에서 `gl_SubgroupID`를 사용해 subgroup 단위로 정렬하면 각 subgroup 내부의 실행 흐름은 coherent하게 유지될 수 있습니다.

핵심 차이는 이것입니다.

```text
나쁜 패턴:
subgroup 내부 lane들이 서로 다른 branch를 탄다.

좋은 패턴:
subgroup 단위로 branch 방향이 정렬된다.
```

### 결론

이번 실험은 GPU에서 branch 자체가 항상 성능 문제는 아니라는 점을 보여줍니다.

Uniform branch처럼 모든 invocation이 같은 경로를 타는 경우, 분기 비용은 상대적으로 작습니다.

또한 branch가 존재하더라도 warp/subgroup 단위로 coherent하다면 성능 저하는 제한적일 수 있습니다.

문제는 같은 warp/subgroup 내부의 lane들이 서로 다른 경로를 타는 경우입니다. 이때 GPU는 양쪽 경로를 순차적으로 실행해야 하므로 일부 lane이 비활성화되고 실행 효율이 떨어집니다.

정리하면 이렇게 말할 수 있습니다.

```text
GPU에서 if문이 항상 느린 것이 아니다.

같은 warp/subgroup 안에서 실행 경로가 갈라질 때 느려질 수 있다.
```

GPU 최적화에서 중요한 것은 `if`문을 무조건 없애는 것이 아닙니다.

> 중요한 것은 warp/subgroup 내부의 실행 흐름을 정렬하는 것이다.
