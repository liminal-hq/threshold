// This plugin's shared native event logger instance
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import ca.liminalhq.threshold.nativelog.NativeEventLog

// Visible package-wide without an import -- writes to both logcat and
// Threshold-wear-sync.log. See NativeEventLog's own KDoc for details.
internal val nativeLog = NativeEventLog("wear-sync")
