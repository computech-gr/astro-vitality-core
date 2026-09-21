import { useEffect, useState } from "react";
import {
  Bluetooth,
  Camera,
  FlaskConical,
  Move3d,
  RadioTower,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  detectBrowserLiveCapabilities,
  type BrowserLiveCapabilities,
  type BrowserLiveCapability,
} from "@/integrations/browser-sensors";

const UNKNOWN_CAPABILITIES: BrowserLiveCapabilities = {
  cameraPpg: { id: "camera_ppg", label: "Phone Camera PPG", availability: "unsupported", detail: "Checking browser capability…" },
  deviceMotion: { id: "device_motion", label: "Phone Motion Sensors", availability: "unsupported", detail: "Checking browser capability…" },
  webBluetooth: { id: "web_bluetooth", label: "Direct Bluetooth Health Sensor", availability: "unsupported", detail: "Checking browser capability…" },
};

function capabilityLabel(capability: BrowserLiveCapability) {
  if (capability.availability === "unsupported") return "UNAVAILABLE HERE";
  if (capability.availability === "permission_required") return "USER PERMISSION";
  return "AVAILABLE";
}

function CapabilityCard({ capability, Icon }: { capability: BrowserLiveCapability; Icon: typeof Camera }) {
  const available = capability.availability !== "unsupported";
  return (
    <Card className="border-border bg-card/70">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{capability.label}</CardTitle>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{capability.detail}</p>
        </div>
        <Icon className="size-5 text-primary" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <Badge variant="outline" className={available ? "border-emerald-400/30 text-emerald-300" : "border-amber-400/30 text-amber-300"}>
          {capabilityLabel(capability)}
        </Badge>
      </CardContent>
    </Card>
  );
}

export function DeviceIntegrationCenter() {
  const [capabilities, setCapabilities] = useState<BrowserLiveCapabilities>(UNKNOWN_CAPABILITIES);

  useEffect(() => setCapabilities(detectBrowserLiveCapabilities()), []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-[96rem] px-5 py-8 lg:px-8">
        <section>
          <p className="section-kicker">Live source orchestration</p>
          <h1 className="mt-3 max-w-4xl font-display text-4xl font-semibold sm:text-5xl">Connect what this device can actually provide.</h1>
          <p className="mt-4 max-w-4xl leading-7 text-muted-foreground">
            The console detects browser capabilities instead of promising unsupported integrations. Camera PPG and phone motion are universal zero-install paths where the browser exposes them; standard BLE remains a direct option on compatible browsers.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild><a href="/mission/live#live-sources">Open Live Monitoring</a></Button>
            <Button asChild variant="outline"><a href="/project/guide#device-integration">Architecture notes</a></Button>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="browser-capabilities-title">
          <p className="section-kicker">This browser</p>
          <h2 id="browser-capabilities-title" className="mt-2 font-display text-2xl font-semibold">Live capability check</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <CapabilityCard capability={capabilities.cameraPpg} Icon={Camera} />
            <CapabilityCard capability={capabilities.deviceMotion} Icon={Move3d} />
            <CapabilityCard capability={capabilities.webBluetooth} Icon={Bluetooth} />
          </div>
        </section>

        <section className="mt-10" aria-labelledby="integration-families-title">
          <p className="section-kicker">Beyond the browser</p>
          <h2 id="integration-families-title" className="mt-2 font-display text-2xl font-semibold">One canonical model, multiple source families</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              [Smartphone, "Wearables & mobile bridges", "Optional native/vendor bridges remain adapter extensions, not judge-demo requirements."],
              [RadioTower, "Environment & radiation", "Cabin telemetry arrives through governed environmental adapters and shares the mission timeline."],
              [FlaskConical, "Medical & laboratory", "Periodic biomarkers enter through governed lab/device/FHIR/manual ingestion, not fabricated live values."],
              [ShieldCheck, "Evidence & provenance", "Every accepted signal retains source, timestamp, quality, classification and provenance."],
            ].map(([Icon, title, body]) => {
              const TypedIcon = Icon as typeof Smartphone;
              return (
                <Card key={title as string} className="border-border bg-card/70">
                  <CardHeader><TypedIcon className="size-5 text-primary" /><CardTitle className="text-base">{title as string}</CardTitle></CardHeader>
                  <CardContent><p className="text-sm leading-6 text-muted-foreground">{body as string}</p></CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
