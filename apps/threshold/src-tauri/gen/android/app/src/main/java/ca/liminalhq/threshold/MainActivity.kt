package ca.liminalhq.threshold

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    applyRingingWindowFlags(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    applyRingingWindowFlags(intent)
  }

  // The manifest's showWhenLocked/turnScreenOn attributes alone aren't reliably honoured
  // for an activity launched via a notification's full-screen intent on every OS version --
  // set them again here as a defensive backstop so the ringing screen actually occludes the
  // keyguard instead of appearing underneath it. Scoped to the ringing deep link only, so a
  // normal app launch while the phone is locked still requires authentication as expected.
  private fun applyRingingWindowFlags(intent: Intent?) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) return
    if (intent?.data?.host == "ringing") {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }
  }
}
