---
title: "Register Pressure는 정말 GPU 성능을 떨어뜨릴까?"
description: "Vulkan compute shader와 timestamp query로 register pressure가 GPU 실행 시간에 어떤 영향을 주는지 직접 측정합니다."
pubDate: 2026-06-05
category: "GPU Architecture Lab"
tags: ["GPU", "Vulkan", "Compute Shader"]
---

### 질문: Register Pressure는 정말 성능을 떨어뜨릴까?

RTR 3장을 읽다 보면 이런 문장을 자주 만나게 됩니다.

> 레지스터 사용량이 증가하면 occupancy가 감소할 수 있다.

그런데 정말 그럴까요?

그리고 occupancy가 감소하면 실제 GPU 성능도 떨어질까요?

대부분은 이 주제를 이렇게만 기억합니다.

```text
레지스터 많이 쓰면 안 좋음
```

하지만 여기서 한 번 더 들어가면 질문이 생깁니다.

```text
왜 안 좋을까?
진짜 느려질까?
느려진다면 얼마나 느려질까?
```

이번 글에서는 이 질문을 Vulkan compute shader로 직접 확인해보겠습니다.

### 문제: GPU는 왜 Warp를 많이 유지하려고 할까?

GPU의 SM은 하나의 작업만 끝까지 붙잡고 실행하지 않습니다. 여러 warp를 준비해두고, 실행 가능한 warp를 빠르게 바꿔가며 처리합니다.

단순화하면 이런 모습입니다.

```text
SM

Warp0
Warp1
Warp2
Warp3
Warp4
Warp5
Warp6
Warp7
```

여기서 `Warp0`이 VRAM load를 만났다고 해보겠습니다.

```text
Warp0

VRAM Load
↓
수백 cycle 대기
```

GPU는 이 대기 시간을 없애지 못합니다. 대신 다른 warp를 실행합니다.

```text
Scheduler

Warp1 실행
Warp2 실행
Warp3 실행
```

이 방식이 latency hiding입니다.

GPU가 메모리를 항상 빠르게 읽어서 성능을 내는 것이 아닙니다. 메모리를 기다리는 동안 다른 warp를 실행할 수 있기 때문에 성능을 유지할 수 있습니다.

따라서 SM 안에 실행 가능한 warp가 많을수록 latency hiding이 쉬워집니다. 여기서 occupancy라는 지표가 등장합니다.

### 가설: Register Pressure가 높으면 Warp를 덜 올릴 수 있다

문제는 GPU 자원이 무한하지 않다는 점입니다.

```text
SM

Registers
Shared Memory
Warp Slots
```

각 warp는 실행되는 동안 register를 사용합니다. 만약 shader 하나가 register를 너무 많이 사용하면, 같은 SM 안에 동시에 올릴 수 있는 warp 수가 줄어들 수 있습니다.

예를 들어 register 사용량이 낮을 때는 이런 상태가 가능하다고 해보겠습니다.

```text
SM

Warp0
Warp1
Warp2
Warp3
Warp4
Warp5
Warp6
Warp7
```

그런데 warp 하나가 너무 많은 register를 요구하면 이런 상태가 될 수 있습니다.

```text
SM

Warp0
Warp1
```

그러면 memory latency가 발생했을 때 scheduler가 바꿔 실행할 후보가 줄어듭니다.

이번 실험의 가설은 다음과 같습니다.

```text
Register Pressure 증가
↓
Resident Warp 수 감소 가능
↓
Occupancy 감소 가능
↓
Latency Hiding 약화
↓
GPU 실행 시간 증가 가능
```

중요한 표현은 "가능"입니다. occupancy가 낮다고 항상 느린 것은 아닙니다. shader가 memory bound인지, ALU bound인지, register spilling이 발생하는지에 따라 결과는 달라질 수 있습니다.

그래서 직접 측정해봅니다.

### 실험: Vulkan Compute Shader로 Register Pressure 만들기

실험은 세 가지 shader 변형을 비교합니다.

```text
low
medium
high
```

각 변형은 의도적으로 register pressure가 달라지도록 구성했습니다.

#### Low

가장 단순한 형태입니다. 적은 수의 임시 값만 사용합니다.

```glsl
float x = inputBuffer.values[id];
x = x * 1.1 + 0.5;
outputBuffer.values[id] = x;
```

#### Medium

여러 개의 독립적인 임시 값을 사용합니다.

```glsl
float a0 = x + 0.01;
float a1 = x + 0.02;
float a2 = x + 0.03;
float a3 = x + 0.04;
float a4 = x + 0.05;
float a5 = x + 0.06;
float a6 = x + 0.07;
float a7 = x + 0.08;
```

#### High

훨씬 많은 임시 값을 유지하도록 만들어 register pressure를 높입니다.

```glsl
float r0 = x + 0.01;
float r1 = x + 0.02;
float r2 = x + 0.03;

// ...

float r63 = x + 0.64;
```

또 하나의 변수로 `local_size_x`도 함께 바꿨습니다.

```text
32
64
128
256
```

측정은 CPU 시간이 아니라 Vulkan timestamp query로 GPU 시간을 측정했습니다.

```text
vkCmdWriteTimestamp
dispatch
vkCmdWriteTimestamp
```

이렇게 하면 command submission이나 CPU 대기 시간이 아니라, GPU command buffer 안에서 해당 dispatch가 차지한 시간을 볼 수 있습니다.

### 결과

실행 명령은 다음과 같습니다.

```powershell
.\VulkanEngine.exe register-pressure
```

측정 결과입니다.

```text
Element count: 262144
Iteration count: 1024
```

| Pressure | Local Size | GPU Time (ms) |
| --- | ---: | ---: |
| low | 32 | 0.2372 |
| low | 64 | 0.2273 |
| low | 128 | 0.2202 |
| low | 256 | 0.2222 |
| medium | 32 | 0.9513 |
| medium | 64 | 0.9503 |
| medium | 128 | 0.9492 |
| medium | 256 | 0.9626 |
| high | 32 | 6.7738 |
| high | 64 | 8.0824 |
| high | 128 | 7.4783 |
| high | 256 | 7.4701 |

숫자만 보면 차이가 꽤 큽니다.

```text
low    ≈ 0.22 ms
medium ≈ 0.95 ms
high   ≈ 6.7 ~ 8.0 ms
```

register pressure를 높인 high variant는 low variant보다 약 30배 이상 느려졌습니다.

### 분석: 느려진 것은 맞지만, 이유는 하나가 아니다

결과만 보면 결론은 쉬워 보입니다.

```text
Register Pressure가 증가하면 GPU Time이 증가한다.
```

하지만 여기서 바로 "레지스터를 적게 쓰자"로 끝내면 중요한 부분을 놓칩니다.

GPU 성능은 단일 지표로 결정되지 않습니다. register pressure는 occupancy에 영향을 줄 수 있지만, 실제 실행 시간은 여러 요소가 함께 결정합니다.

```text
Register 사용량
Memory latency
ALU utilization
Instruction count
Register spilling
Workgroup size
```

이번 결과에서 low와 medium은 `local_size` 변화에 거의 영향을 받지 않았습니다.

```text
low:    0.2202 ~ 0.2372 ms
medium: 0.9492 ~ 0.9626 ms
```

반면 high는 전체적으로 훨씬 느리고, `local_size = 64`에서 가장 느린 값이 나왔습니다.

```text
high:
32  -> 6.7738 ms
64  -> 8.0824 ms
128 -> 7.4783 ms
256 -> 7.4701 ms
```

이 결과는 register pressure가 성능에 영향을 줄 수 있다는 점을 보여줍니다. 동시에 workgroup size와 register pressure의 관계가 항상 단순한 직선 형태는 아니라는 점도 보여줍니다.

`local_size`를 키우면 workgroup 하나 안의 invocation 수가 늘어납니다. 하지만 이것이 항상 더 많은 latency hiding으로 이어지는 것은 아닙니다. register 사용량, SM당 resident workgroup 수, warp scheduling, 메모리 접근 패턴이 같이 얽히기 때문입니다.

즉, occupancy는 중요한 힌트지만 성능 자체는 아닙니다.

### Nsight Compute로 더 확인하고 싶은 것

이번 Vulkan timestamp 결과만으로도 register pressure에 따른 GPU time 차이는 확인할 수 있었습니다.

다만 다음 단계에서는 Nsight Compute로 아래 항목을 같이 확인하면 분석이 더 단단해집니다.

```text
Registers Per Thread
Achieved Occupancy
Theoretical Occupancy
Active Warps Per SM
Warp Stall Reasons
Local Memory Load/Store
```

특히 local memory 접근이 보이면 register spilling이 발생했을 가능성을 의심할 수 있습니다. 이 경우 성능 하락은 단순히 occupancy 감소 때문만이 아니라, register가 부족해서 일부 값이 local memory로 밀려난 결과일 수도 있습니다.

그래서 다음과 같은 식으로 검증할 수 있습니다.

```text
Register Count 증가
↓
Occupancy 감소
↓
또는 Register Spilling 발생
↓
GPU Time 증가
```

이 구분이 중요합니다. 둘 다 register pressure와 관련 있지만, 병목의 성격은 다릅니다.

### 결론

이번 실험에서는 register pressure가 증가할수록 GPU 실행 시간이 크게 증가하는 것을 확인했습니다.

하지만 결론은 단순히 "레지스터를 적게 쓰자"가 아닙니다.

더 정확한 결론은 이렇습니다.

```text
Register Pressure는 occupancy를 낮출 수 있다.
Occupancy가 낮아지면 latency hiding 능력이 약해질 수 있다.
하지만 occupancy가 항상 성능을 결정하는 것은 아니다.
```

성능은 여러 요소의 균형으로 결정됩니다.

- Register 사용량
- Memory latency
- ALU utilization
- Instruction count
- Workgroup size
- Register spilling 여부

따라서 occupancy는 최적화의 목표라기보다, 성능을 이해하기 위한 지표로 보는 것이 더 적절합니다.

이번 실험의 핵심은 이것입니다.

```text
Register Pressure는 실제 GPU Time에 영향을 줄 수 있다.
하지만 그 영향은 occupancy 하나만으로 설명되지 않는다.
```

그래서 GPU 최적화에서는 항상 질문을 더 쪼개야 합니다.

```text
느려졌는가?
왜 느려졌는가?
occupancy 때문인가?
spilling 때문인가?
memory bound인가?
ALU bound인가?
```

이 질문을 실제 코드와 측정값으로 확인하는 것이 GPU 성능 분석의 출발점입니다.
