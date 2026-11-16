function FindProxyForURL(url, host) {
  var p = "PROXY 192.168.137.1:31182; DIRECT";
  if (shExpMatch(host, "*.google.com")) return p;
  if (shExpMatch(host, "*.gstatic.com")) return p;
  if (shExpMatch(host, "*.googleapis.com")) return p;
  if (shExpMatch(host, "*.googleusercontent.com")) return p;
  if (shExpMatch(host, "*.googlevideo.com")) return p;
  if (shExpMatch(host, "*.youtube.com")) return p;
  if (shExpMatch(host, "*.ytimg.com")) return p;
  if (shExpMatch(host, "*.ggpht.com")) return p;
  if (shExpMatch(host, "google.com")) return p;
  if (shExpMatch(host, "accounts.google.com")) return p;
  return "DIRECT";
}
