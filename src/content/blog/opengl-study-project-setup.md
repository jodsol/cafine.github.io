---
title: "C++ 중심 OpenGL 공부 프로젝트 세팅하기"
description: "CMake, vcpkg, GLFW, GLAD, VS Code를 이용해 C++ 중심의 OpenGL 공부용 프로젝트를 세팅한 과정을 정리합니다."
pubDate: 2026-06-27
category: "C++ / OpenGL"
tags: ["C++", "OpenGL", "CMake", "vcpkg", "VS Code"]
---

이번 글은 `C++를 중심으로 공부하고, OpenGL은 보조 프로젝트로 붙이고 싶을 때` 어떤 식으로 프로젝트를 세팅하면 좋은지 정리한 글이다.

내가 원했던 방향은 단순했다.

- C++ 문법과 modern C++ 감각을 먼저 익히고 싶다.
- OpenGL 세팅 때문에 초반 공부 흐름이 끊기고 싶지 않다.
- VS Code에서 빌드, 실행, 디버그가 한 번에 돌아가면 좋겠다.

그래서 프로젝트를 처음부터 두 개의 실행 타깃으로 나눴다.

## 왜 `cpp_sandbox`와 `opengl_sandbox`를 나눴나

처음에는 하나의 프로젝트 안에서 다 같이 해도 될 것 같았는데, 막상 해보면 학습 포인트가 너무 다르다.

- `cpp_sandbox`
  - C++ 문법, 표준 라이브러리, 함수 분리, 클래스 설계, 리팩토링 연습용
- `opengl_sandbox`
  - GLFW, GLAD, OpenGL context, 렌더링 파이프라인 실습용

이 둘을 한 덩어리로 묶으면 OpenGL 의존성 문제 때문에 C++ 공부까지 같이 멈추기 쉽다.

그래서 먼저 `cpp_sandbox`는 바로 빌드되게 만들고, `opengl_sandbox`는 의존성이 준비되면 켜지는 구조로 잡았다.

## 사용한 도구

- `CMake`
- `clang/clang++`
- `vcpkg`
- `GLFW`
- `GLAD`
- `VS Code`

핵심은 OpenGL 헤더와 라이브러리를 수동 복사하지 않고, `vcpkg`로 관리하게 만든 점이다.

## 디렉터리 구조

```text
opengl/
  src/
    cpp_sandbox/
      main.cpp
    opengl_sandbox/
      main.cpp
  .vscode/
    tasks.json
    launch.json
    settings.json
  vcpkg.json
  CMakeLists.txt
```

## CMake 구성

프로젝트는 `cpp_sandbox`와 `opengl_sandbox` 두 타깃을 가진다.

`cpp_sandbox`는 항상 빌드 가능하게 두고,
`opengl_sandbox`는 `OpenGL`, `glfw3`, `glad`를 찾았을 때만 빌드되게 만들었다.

중요한 부분은 대략 이런 식이다.

```cmake
find_package(OpenGL QUIET)
find_package(glfw3 CONFIG QUIET)
find_package(glad CONFIG QUIET)

if(OpenGL_FOUND AND glfw3_FOUND AND glad_FOUND)
    add_executable(opengl_sandbox
        src/opengl_sandbox/main.cpp
    )

    target_link_libraries(opengl_sandbox PRIVATE
        OpenGL::GL
        glfw
        glad::glad
    )
endif()
```

이렇게 해두면 공부 초반에는 C++ 타깃만 쓰다가, OpenGL 준비가 끝난 뒤 자연스럽게 다음 단계로 넘어갈 수 있다.

## vcpkg로 GLFW/GLAD 설치

OpenGL 쪽은 `glad/glad.h`, `GLFW/glfw3.h`가 필요하다.
처음에는 직접 헤더를 복사하는 방식도 생각했지만, 나중에 관리가 더 귀찮아진다.

그래서 프로젝트 안에 `vcpkg`를 두고 아래처럼 의존성을 선언했다.

```json
{
  "name": "opengl-study",
  "version-string": "0.1.0",
  "dependencies": [
    "glad",
    "glfw3"
  ]
}
```

그 다음 `CMAKE_TOOLCHAIN_FILE`을 `vcpkg` 쪽으로 연결하면 된다.

## VS Code 설정

이번 세팅에서 가장 헷갈렸던 부분은 `프로젝트 빌드`와 `현재 파일 단독 빌드`가 섞이는 문제였다.

예를 들어 VS Code가 `C/C++: clang.exe build active file`를 실행하면 이런 문제가 생길 수 있다.

- `-std=c++20` 옵션이 빠짐
- `std::string_view`, `std::optional`를 못 알아봄
- CMake가 관리하는 include/link 설정을 전혀 안 씀

그래서 기본 빌드는 무조건 CMake 타깃을 타게 바꿨다.

- `CMake: build cpp_sandbox`
- `CMake: build opengl_sandbox`
- `Run: cpp_sandbox`
- `Run: opengl_sandbox`

디버그 구성도 따로 나눠서 만들었다.

- `Debug cpp_sandbox`
- `Debug opengl_sandbox`

이렇게 해두면:

- `F5`로 디버깅 실행
- `Ctrl + Shift + B`로 빌드
- 실행 타깃만 바꿔가며 학습

이 흐름이 깔끔해진다.

## IntelliSense에서 빨간 줄이 뜰 때

실제 빌드는 되는데 편집기에서만 `#include errors detected`나 `std::string_view` 관련 빨간 줄이 뜨는 경우가 있다.

이럴 때는 보통 코드 문제가 아니라 VS Code가 `compile_commands.json`을 제대로 안 따라가서 생긴다.

내가 정리한 방식은 이렇다.

- `build/compile_commands.json` 사용
- C++ 표준을 `c++20`으로 고정
- `windows-clang-x64` IntelliSense mode 사용
- 필요하면 `CMake: Delete Cache and Reconfigure`
- 그 다음 `Developer: Reload Window`

특히 OpenGL 쪽은 의존성이 없을 때 경고가 많이 떠서, 파일을 열었을 때 바로 망가지지 않도록 안전장치도 넣어두면 좋다.

## 실제 학습 흐름

이 세팅을 하고 나면 학습 흐름이 아주 단순해진다.

### 1단계: `cpp_sandbox`

여기서는 이런 걸 연습한다.

- `std::vector`
- `std::optional`
- `std::string_view`
- 함수 분리
- 입력 처리
- 작은 메뉴 프로그램 만들기

예를 들어 간단한 `Study Task Manager` 같은 콘솔 프로그램은 C++ 연습용으로 꽤 좋다.

### 2단계: `opengl_sandbox`

OpenGL 쪽은 처음부터 화려하게 가지 않고 아래 순서로 가면 좋다.

- 창 띄우기
- clear color
- 삼각형 하나 그리기
- VAO / VBO
- shader
- texture

핵심은 OpenGL을 배우는 동시에, 그 코드를 `좋은 C++ 구조`로 다루는 연습을 같이 하는 것이다.

## 이번 세팅에서 좋았던 점

- C++ 공부와 OpenGL 공부를 분리할 수 있었다.
- OpenGL 의존성 때문에 초반 진도가 막히지 않았다.
- VS Code에서 빌드/실행/디버그 흐름을 한 번 정리하니 이후가 편해졌다.
- `vcpkg`로 의존성을 관리하니 수동 세팅 스트레스가 크게 줄었다.

## 마무리

OpenGL을 공부하고 싶어도, 초반에는 `그래픽스 API`보다 `C++ 코드 구조`가 더 중요할 수 있다.

그래서 공부용 프로젝트를 처음 만들 때는:

- `C++ 연습장`
- `OpenGL 실습장`

이 둘을 분리해 두는 편이 훨씬 효율적이었다.

다음 단계는 `opengl_sandbox`에 삼각형 하나를 실제로 그려보는 것이다.
그 과정에서 `VAO`, `VBO`, `shader`, `vertex data`를 자연스럽게 익힐 수 있다.
