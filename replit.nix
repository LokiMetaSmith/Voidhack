{ pkgs }: {
  deps = [
    pkgs.gh
    pkgs.python311
    pkgs.redis
    pkgs.lsof
    pkgs.libxcrypt
  ];
}
