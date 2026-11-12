/* posix_fallocate function that is glibc compatible.

   Copyright (C) 2024 Free Software Foundation, Inc.

   This file is free software: you can redistribute it and/or modify
   it under the terms of the GNU Lesser General Public License as
   published by the Free Software Foundation; either version 2.1 of the
   License, or (at your option) any later version.

   This file is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU Lesser General Public License for more details.

   You should have received a copy of the GNU Lesser General Public License
   along with this program.  If not, see <https://www.gnu.org/licenses/>.  */

#include <config.h>

#include <errno.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdint.h>
#include <sys/fcntl.h>
#include <sys/stat.h>

#ifdef __APPLE__
# include <sys/param.h>
# include <sys/mount.h>
#else
# include <sys/statfs.h>
#endif

/* Reserve storage for the data of the file associated with FD.  This
   emulation is far from perfect, but the kernel cannot do not much
   better for network file systems, either.  */

int
posix_fallocate (int fd, off_t offset, off_t len)
{
  int ret;
  struct stat st;

  if (fd < 0 || offset < 0 || len < 0)
    return EINVAL;

  /* Perform overflow check.  The outer cast relies on a GCC
     extension.  */
  if ((off_t) ((uint64_t) offset + (uint64_t) len) < 0)
    return EFBIG;

  /* pwrite below will not do the right thing in O_APPEND mode.  */
  {
    int flags = fcntl (fd, F_GETFL, 0);
    if (flags < 0 || (flags & O_APPEND) != 0)
      return EBADF;
  }

  /* We have to make sure that this is really a regular file.  */
  if (fstat (fd, &st) != 0)
    return EBADF;
  if (S_ISFIFO (st.st_mode))
    return ESPIPE;
  if (! S_ISREG (st.st_mode))
    return ENODEV;

  if (len == 0)
    {
      /* This is racy, but there is no good way to satisfy a
	 zero-length allocation request.  */
      if (st.st_size < offset)
	{
	  ret = ftruncate (fd, offset);

	  if (ret != 0)
	    ret = errno;
	  return ret;
	}
      return ret;
    }

#ifdef __APPLE__
    fstore_t sto = {F_ALLOCATECONTIG, F_PEOFPOSMODE, 0, offset + len, 0};
    /* allocate continuous */
    ret = fcntl (fd, F_PREALLOCATE, &sto);
    if (ret < 0)
      {
        /* allocate non-continuous */
        sto.fst_flags = F_ALLOCATEALL;
        ret = fcntl (fd, F_PREALLOCATE, &sto);
        if (ret < 0)
          {
            return ret;
          }
      }
    ret = ftruncate(fd, offset + len);
#else

  /* Minimize data transfer for network file systems, by issuing
     single-byte write requests spaced by the file system block size.
     (Most local file systems have fallocate support, so this fallback
     code is not used there.)  */

  unsigned increment;
  {
    struct statfs f;

    if (fstatfs (fd, &f) != 0)
      return errno;
    if (f.f_bsize == 0)
      increment = 512;
    else if (f.f_bsize < 4096)
      increment = f.f_bsize;
    else
      /* NFS does not propagate the block size of the underlying
	 storage and may report a much larger value which would still
	 leave holes after the loop below, so we cap the increment at
	 4096.  */
      increment = 4096;
  }

  /* Write a null byte to every block.  This is racy; we currently
     lack a better option.  Compare-and-swap against a file mapping
     might additional local races, but requires interposition of a
     signal handler to catch SIGBUS.  */
  for (offset += (len - 1) % increment; len > 0; offset += increment)
    {
      len -= increment;

      if (offset < st.st_size)
	{
	  unsigned char c;
	  ssize_t rsize = pread (fd, &c, 1, offset);

	  if (rsize < 0)
	    return errno;
	  /* If there is a non-zero byte, the block must have been
	     allocated already.  */
	  else if (rsize == 1 && c != 0)
	    continue;
	}

      if (pwrite (fd, "", 1, offset) != 1)
	return errno;
    }

#endif /* __APPLE__ */

  return ret;
}
