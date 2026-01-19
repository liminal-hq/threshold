# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class ca.liminalhq.threshold.* {
  native <methods>;
}

-keep class ca.liminalhq.threshold.WryActivity {
  public <init>(...);

  void setWebView(ca.liminalhq.threshold.RustWebView);
  java.lang.Class getAppClass(...);
  java.lang.String getVersion();
}

-keep class ca.liminalhq.threshold.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class ca.liminalhq.threshold.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class ca.liminalhq.threshold.RustWebChromeClient,ca.liminalhq.threshold.RustWebViewClient {
  public <init>(...);
}
