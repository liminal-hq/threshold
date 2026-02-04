import SwiftRs
import Tauri
import UIKit
import WebKit

class AppManagementPlugin: Plugin {
  @objc public func minimize_app(_ invoke: Invoke) throws {
    // Stub: iOS does not support programmatically minimizing to background easily/legally via public API in the same way.
    // Usually one uses `suspend` which is private API, or just instructs user.
    // For now, this is a no-op / stub.
    invoke.resolve()
  }
}

@_cdecl("init_plugin_app_management")
func initPlugin() -> Plugin {
  return AppManagementPlugin()
}
