# Desktop awareness

Settings → Privacy → App awareness (Windows) enables a separate, default-off feature. Existing Basic Awareness opt-ins do not enable it. Both preferences can classify idle time locally; Desktop Awareness also enables a hidden, long-lived Windows PowerShell helper that samples Win32 foreground-window metadata once per second. It compiles its native calls once per helper lifetime, not once per sample.

Only the foreground process name, process ID, fullscreen boolean, and optional keyboard-activity boolean cross into the main process. No titles, window contents, screenshots, transcripts, or history are collected. Metadata is ephemeral and is not part of creature state, exports, renderer messages, or dialogue requests.

Fullscreen means a non-captioned foreground window covers its monitor bounds, within two pixels. Desktop and taskbar surfaces and Tiny Mint's own process are ignored. Coordinates are sampled in a per-monitor DPI-aware thread. The overlay and speech hide while fullscreen is active; roaming and autonomous check-ins are suppressed, and visibility recovers on exit. Existing manual conversations remain available after recovery. Room and settings windows stay under the user's control.

Five minutes idle leads to rest, fifteen to sleep, at the next desktop decision. Room routines and manual interactions keep their normal lifecycle. App switches or returning to an idle creature can trigger a two-second look/happy reaction, at most once per minute, without changing recorded user-interaction history.

Disabling both native-awareness preferences, resetting state, suspending, or quitting stops the helper. Changing either switch restarts it with only the requested detectors enabled. The helper also exits if its parent disappears. Failed or stale sampling clears fullscreen suppression after at most ten seconds; retries are limited to once every thirty seconds. Failed app detection leaves idle-only behavior available.

Validation: tests cover metadata validation, privacy-preserving migration, behavior recovery and interruption guards. The production smoke test checks settings round-trip, fullscreen suppression surviving state broadcasts, and recovery after metadata becomes unavailable. Real exclusive-game and multi-monitor/mixed-DPI behavior requires manual validation; no battery-impact claim is made.

Native API references: [GetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow), [GetWindowRect](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowrect), [MonitorFromWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-monitorfromwindow).

## Keyboard and app behavior

Keyboard Awareness is separately opt-in and defaults off for existing saves. Its Windows hook checks only whether a key-down event occurred, never dereferencing the keyboard-event payload. It forwards all events unchanged and stores only the time of the latest event in helper memory. Only a recent-activity boolean crosses into the app. Typing pauses roaming and autonomous speech through five seconds after the last event; manual conversations remain available. At the next desktop behavior decision the creature settles into sitting. Keyboard-only mode does not call foreground-app APIs.

App Awareness maps exact process names to coding, writing, browser, media, creative, or other. Coding/writing produces reading, media sitting, creative work drawing; browsing and unknown apps retain normal behavior plus switch reactions. It does not infer website, document, song, or task contents. Paused simulation, manual routines, and conversations retain priority. These observations never enter save/export data or dialogue requests.

The keyboard hook requires an interactive Windows session and may be unavailable on secure desktops or under endpoint policy. Failure clears transient signals and uses the existing bounded retry. No key identities or typed text are logged.
