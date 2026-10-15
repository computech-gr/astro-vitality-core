# P35.4.2 — Account password and live device controls

- Signed-in users can change their own password using Supabase Auth. Online access is required. No password is stored in application tables.
- Each source card has its own Stop monitoring button when that source is connected. The existing single-source architecture is preserved; stopping aborts the stream and disconnects the adapter.
- Motion ignores absent acceleration readings and reports a startup error if the browser exposes the API without real usable sensor events.
- Camera PPG retains the basic working video stream when optional rear-camera selection fails. A missing physical camera or blocked permission cannot be fixed in software.
- BLE requires compatible browser, OS, Bluetooth hardware, permission and a nearby standard Heart Rate Service device. No sensor is emulated.
- Offline: once loaded and cached, local physical capture and encrypted writes can operate without Internet, subject to browser, permission, device and storage availability. Cloud sync and password changes require Internet. A powered-off/disconnected device cannot generate physical samples.
- Validate on real Android phone with permissions, desktop without sensors, online/offline transitions, both Crew Self memberships, camera stop/restart, motion stop/restart, BLE stop/restart, no post-stop samples, encrypted persistence, and cloud reconciliation.
- FV-01-13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; no clinical activation.
