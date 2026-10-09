if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "D:/ProgramData/React_native/AccessControlLock/mobile/.gradle/caches/8.13/transforms/c84dba0842784e07d95045a8302cd32b/transformed/hermes-android-0.79.7-debug/prefab/modules/libhermes/libs/android.arm64-v8a/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "D:/ProgramData/React_native/AccessControlLock/mobile/.gradle/caches/8.13/transforms/c84dba0842784e07d95045a8302cd32b/transformed/hermes-android-0.79.7-debug/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

