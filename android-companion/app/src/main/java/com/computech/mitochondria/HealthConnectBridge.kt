package com.computech.mitochondria

import android.webkit.JavascriptInterface
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.concurrent.atomic.AtomicLong

class HealthConnectBridge(
    private val client: HealthConnectClient,
) {
    private val cursorMillis = AtomicLong(0L)
    private val heartRatePermission = HealthPermission.getReadPermission(HeartRateRecord::class)

    @JavascriptInterface
    fun sourceId(): String = "health-connect:samsung-health"

    @JavascriptInterface
    fun displayName(): String = "Samsung Health via Health Connect"

    @JavascriptInterface
    fun availableMetricCodes(): String = JSONArray(listOf("phys.heart_rate")).toString()

    @JavascriptInterface
    fun cursor(): String = cursorMillis.get().takeIf { it > 0L }?.toString() ?: ""

    @JavascriptInterface
    fun health(): String = runBlocking(Dispatchers.IO) {
        val granted = client.permissionController.getGrantedPermissions().contains(heartRatePermission)
        JSONObject()
            .put("available", granted)
            .apply {
                if (!granted) put("message", "Health Connect heart-rate permission has not been granted")
            }
            .toString()
    }

    @JavascriptInterface
    fun readRecords(metricCodesJson: String, cursor: String): String = runBlocking(Dispatchers.IO) {
        val requested = JSONArray(metricCodesJson)
        val wantsHeartRate = (0 until requested.length()).any { requested.optString(it) == "phys.heart_rate" }
        if (!wantsHeartRate) {
            return@runBlocking JSONObject().put("records", JSONArray()).put("cursor", cursor()).toString()
        }

        val granted = client.permissionController.getGrantedPermissions().contains(heartRatePermission)
        if (!granted) throw SecurityException("Health Connect heart-rate permission is required")

        val previousCursor = cursor.toLongOrNull()?.coerceAtLeast(0L) ?: cursorMillis.get()
        val end = Instant.now()
        val start = if (previousCursor > 0L) {
            Instant.ofEpochMilli(previousCursor).minus(1, ChronoUnit.SECONDS)
        } else {
            end.minus(15, ChronoUnit.MINUTES)
        }

        val records = JSONArray()
        var newest = previousCursor
        var pageToken: String? = null

        do {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = HeartRateRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(start, end),
                    pageToken = pageToken,
                ),
            )
            response.records.forEach { record ->
                record.samples.forEach { sample ->
                    val sampleMillis = sample.time.toEpochMilli()
                    if (sampleMillis > previousCursor) {
                        records.put(
                            JSONObject()
                                .put("recordId", "${record.metadata.id}:$sampleMillis")
                                .put("metricCode", "phys.heart_rate")
                                .put("observedAt", sample.time.toString())
                                .put("value", JSONObject().put("number", sample.beatsPerMinute))
                                .put("unit", "bpm")
                                .put("dataOrigin", record.metadata.dataOrigin.packageName),
                        )
                        newest = maxOf(newest, sampleMillis)
                    }
                }
            }
            pageToken = response.pageToken
        } while (pageToken != null)

        if (newest > 0L) cursorMillis.set(newest)
        JSONObject()
            .put("records", records)
            .put("cursor", cursor())
            .toString()
    }
}
