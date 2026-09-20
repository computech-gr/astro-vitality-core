package com.computech.mitochondria

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateRecord
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

private const val CANONICAL_LIVE_URL = "https://mitochondria.edocinfo.com/mission/live"

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private var healthConnectClient: HealthConnectClient? = null

    private val requestPermission = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract(),
    ) {
        loadMissionConsole()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)
        setupHealthConnect()
    }

    private fun setupHealthConnect() {
        val status = HealthConnectClient.getSdkStatus(this)
        if (status != HealthConnectClient.SDK_AVAILABLE) {
            loadMissionConsole()
            return
        }

        val client = HealthConnectClient.getOrCreate(this)
        healthConnectClient = client
        lifecycleScope.launch {
            val permission = HealthPermission.getReadPermission(HeartRateRecord::class)
            val granted = client.permissionController.getGrantedPermissions()
            if (permission in granted) {
                loadMissionConsole()
            } else {
                requestPermission.launch(setOf(permission))
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun loadMissionConsole() {
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.cacheMode = WebSettings.LOAD_DEFAULT
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return if (url?.startsWith("https://mitochondria.edocinfo.com/") == true) {
                    false
                } else {
                    true
                }
            }
        }
        healthConnectClient?.let { client ->
            webView.addJavascriptInterface(HealthConnectBridge(client), "MitochondriaHealthConnect")
        }
        webView.loadUrl(CANONICAL_LIVE_URL)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}
