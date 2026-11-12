# posix_fallocate.m4 serial 1
dnl Copyright (C) 2024 Free Software Foundation, Inc.
dnl This file is free software; the Free Software Foundation
dnl gives unlimited permission to copy and/or distribute it,
dnl with or without modifications, as long as this notice is preserved.

AC_DEFUN([gl_FUNC_POSIX_FALLOCATE],
[
  AC_REQUIRE([gl_FCNTL_H_DEFAULTS])
  gl_CHECK_FUNCS_ANDROID([posix_fallocate], [[#include <fcntl.h>]])
  if test "$ac_cv_func_posix_fallocate" = no; then
    HAVE_FALLOCATE_POSIX=0
    case "$gl_cv_onwards_func_posix_fallocate" in
      future*) REPLACE_FALLOCATE_POSIX=1 ;;
    esac
  fi
])

# Prerequisites of lib/posix_fallocate.c.
AC_DEFUN([gl_PREREQ_POSIX_FALLOCATE], [:])
