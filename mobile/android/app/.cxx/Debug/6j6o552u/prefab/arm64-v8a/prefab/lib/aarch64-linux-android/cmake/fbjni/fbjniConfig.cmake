if(NOT TARGET fbjni::fbjni)
add_library(fbjni::fbjni SHARED IMPORTED)
set_target_properties(fbjni::fbjni PROPERTIES
    IMPORTED_LOCATION "D:/ProgramData/React_native/AccessControlLock/mobile/.gradle/caches/8.13/transforms/ecc360991f6e72abc8ac0f2009a2f64d/transformed/fbjni-0.7.0/prefab/modules/fbjni/libs/android.arm64-v8a/libfbjni.so"
    INTERFACE_INCLUDE_DIRECTORIES "D:/ProgramData/React_native/AccessControlLock/mobile/.gradle/caches/8.13/transforms/ecc360991f6e72abc8ac0f2009a2f64d/transformed/fbjni-0.7.0/prefab/modules/fbjni/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

