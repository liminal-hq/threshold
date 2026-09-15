// This plugin's shared native event logger instance
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.app_management

import ca.liminalhq.threshold.nativelog.NativeEventLog

// Visible package-wide without an import -- writes to both logcat and
// Threshold-app-management.log. See NativeEventLog's own KDoc for details.
internal val nativeLog = NativeEventLog("app-management")
