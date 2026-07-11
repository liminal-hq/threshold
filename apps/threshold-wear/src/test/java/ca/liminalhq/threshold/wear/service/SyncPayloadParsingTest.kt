// Unit tests for the pure sync-payload parsing logic in DataLayerListenerService.kt
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear.service

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncPayloadParsingTest {

    @Test
    fun `FullSync envelope resolves to ReplaceAll with parsed alarms`() {
        val json = """
            {
                "type": "FullSync",
                "allAlarms": [
                    {"id": 1, "hour": 7, "minute": 0, "label": "Morning", "enabled": true}
                ]
            }
        """
        val action = parseSyncPayload(json)

        assertTrue(action is SyncAction.ReplaceAll)
        assertEquals(1, (action as SyncAction.ReplaceAll).alarms.size)
        assertEquals(1, action.alarms[0].id)
    }

    @Test
    fun `FullSync envelope with an empty allAlarms array clears alarms`() {
        val json = """{"type": "FullSync", "allAlarms": []}"""

        val action = parseSyncPayload(json)

        assertTrue(action is SyncAction.ReplaceAll)
        assertTrue((action as SyncAction.ReplaceAll).alarms.isEmpty())
    }

    @Test
    fun `Incremental envelope resolves to ApplyIncremental`() {
        val json = """
            {
                "type": "Incremental",
                "updatedAlarms": [
                    {"id": 2, "hour": 8, "minute": 15, "label": "", "enabled": true}
                ],
                "deletedAlarmIds": [5, 6]
            }
        """
        val action = parseSyncPayload(json)

        assertTrue(action is SyncAction.ApplyIncremental)
        val incremental = action as SyncAction.ApplyIncremental
        assertEquals(1, incremental.updatedAlarms.size)
        assertEquals(2, incremental.updatedAlarms[0].id)
        assertEquals(listOf(5, 6), incremental.deletedAlarmIds)
    }

    @Test
    fun `UpToDate envelope resolves to UpToDate`() {
        val json = """{"type": "UpToDate"}"""

        assertEquals(SyncAction.UpToDate, parseSyncPayload(json))
    }

    @Test
    fun `legacy plain array payload (no envelope) resolves to ReplaceAll`() {
        // Batch-publish payloads that predate the typed envelope are a bare
        // JSON array. JSONObject(..) rejects a leading '[', so this is
        // handled by the outer JSONException fallback in parseSyncPayload.
        val json = """
            [
                {"id": 1, "hour": 7, "minute": 0, "label": "Morning", "enabled": true},
                {"id": 2, "hour": 8, "minute": 0, "label": "Backup", "enabled": false}
            ]
        """

        val action = parseSyncPayload(json)

        assertTrue(action is SyncAction.ReplaceAll)
        assertEquals(2, (action as SyncAction.ReplaceAll).alarms.size)
    }

    @Test
    fun `legacy empty array payload clears alarms instead of being dropped (issue 159)`() {
        // Regression test for issue #159: a valid, intentional "clear all
        // watch alarms" signal from the phone is a bare empty array. This
        // must still resolve to ReplaceAll(emptyList()) rather than being
        // silently ignored just because the list happens to be empty.
        val action = parseSyncPayload("[]")

        assertTrue(action is SyncAction.ReplaceAll)
        assertTrue((action as SyncAction.ReplaceAll).alarms.isEmpty())
    }

    @Test
    fun `unparseable payload resolves to ParseFailure`() {
        val action = parseSyncPayload("not json at all")

        assertTrue(action is SyncAction.ParseFailure)
    }

    // Note: parseAlarmArray's per-entry error path calls android.util.Log, which
    // isn't mocked under plain JUnit here (no Robolectric in this module), so a
    // "malformed entry is skipped" test isn't included to keep this file running
    // under the existing test setup. All-valid-entry cases are covered above.
}
