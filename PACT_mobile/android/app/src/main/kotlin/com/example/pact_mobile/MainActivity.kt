package com.example.pact_mobile

import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.plugin.common.EventChannel

class MainActivity : FlutterFragmentActivity(), EventChannel.StreamHandler {
	companion object {
		private const val SOS_VOLUME_EVENT_CHANNEL = "pact_mobile/sos_volume_button_events"
		private const val VOLUME_HOLD_THRESHOLD_MS = 3000L
	}

	private var eventSink: EventChannel.EventSink? = null
	private var volumeUpPressStartMs: Long? = null
	private var holdTriggeredForCurrentPress: Boolean = false
	private val mainHandler = Handler(Looper.getMainLooper())
	private val volumeHoldRunnable = Runnable {
		val pressStart = volumeUpPressStartMs ?: return@Runnable
		if (holdTriggeredForCurrentPress) return@Runnable

		val heldDuration = System.currentTimeMillis() - pressStart
		holdTriggeredForCurrentPress = true
		eventSink?.success(
			mapOf(
				"event" to "volume_up_hold_3s",
				"held_ms" to heldDuration,
			),
		)
	}

	override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
		super.configureFlutterEngine(flutterEngine)

		EventChannel(
			flutterEngine.dartExecutor.binaryMessenger,
			SOS_VOLUME_EVENT_CHANNEL,
		).setStreamHandler(this)
	}

	override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
		eventSink = events
	}

	override fun onCancel(arguments: Any?) {
		eventSink = null
	}

	override fun dispatchKeyEvent(event: KeyEvent): Boolean {
		if (event.keyCode == KeyEvent.KEYCODE_VOLUME_UP) {
			when (event.action) {
				KeyEvent.ACTION_DOWN -> {
					if (volumeUpPressStartMs == null) {
						volumeUpPressStartMs = System.currentTimeMillis()
						holdTriggeredForCurrentPress = false
						mainHandler.removeCallbacks(volumeHoldRunnable)
						mainHandler.postDelayed(volumeHoldRunnable, VOLUME_HOLD_THRESHOLD_MS)
					}
				}

				KeyEvent.ACTION_UP -> {
					mainHandler.removeCallbacks(volumeHoldRunnable)
					volumeUpPressStartMs = null
					holdTriggeredForCurrentPress = false
				}
			}
		}

		return super.dispatchKeyEvent(event)
	}

	override fun onPause() {
		mainHandler.removeCallbacks(volumeHoldRunnable)
		volumeUpPressStartMs = null
		holdTriggeredForCurrentPress = false
		super.onPause()
	}
}
