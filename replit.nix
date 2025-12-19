{ pkgs }: {
  deps = [
    pkgs.python311
    pkgs.redis
    pkgs.lsof
    pkgs.libxcrypt
  ];
}
