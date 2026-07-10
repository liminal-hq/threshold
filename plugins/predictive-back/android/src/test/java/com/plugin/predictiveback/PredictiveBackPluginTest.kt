// Tests the API-level + eligibility gate for registering the predictive-back callback
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.predictiveback

import android.os.Build
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PredictiveBackPluginTest {
    @Test
    fun `registers when canGoBack is true on API 33 and above`() {
        assertTrue(shouldRegisterPredictiveBack(Build.VERSION_CODES.TIRAMISU, canGoBack = true))
        assertTrue(shouldRegisterPredictiveBack(Build.VERSION_CODES.TIRAMISU + 1, canGoBack = true))
    }

    @Test
    fun `does not register when canGoBack is false, even on API 33 and above`() {
        assertFalse(shouldRegisterPredictiveBack(Build.VERSION_CODES.TIRAMISU, canGoBack = false))
    }

    @Test
    fun `never registers below API 33, regardless of canGoBack`() {
        assertFalse(
            shouldRegisterPredictiveBack(Build.VERSION_CODES.TIRAMISU - 1, canGoBack = true)
        )
    }
}
