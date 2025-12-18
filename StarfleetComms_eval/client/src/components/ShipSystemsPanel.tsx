import { Shield, Zap, Activity, Radio, Wind, Crosshair } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ShipSystemStatus } from "@shared/schema";

interface ShipSystemsPanelProps {
  systems: ShipSystemStatus;
}

export function ShipSystemsPanel({ systems }: ShipSystemsPanelProps) {
  const getStatusColor = (status: string) => {
    if (status === "Online") return "text-chart-4";
    if (status === "Warning") return "text-chart-5";
    if (status === "Offline" || status === "Critical") return "text-destructive";
    return "text-muted-foreground";
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider">Ship Systems</h3>
        <div className="text-xs text-muted-foreground">USS Enterprise NCC-1701-D</div>
      </div>

      <div className="space-y-2">
        {/* Warp Core */}
        <div className="flex items-center gap-2" data-testid="system-warp-core">
          <Zap className={`h-4 w-4 ${getStatusColor(systems.warpCore.status)}`} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs">Warp Core</span>
              <span className="text-xs text-muted-foreground">{systems.warpCore.efficiency}%</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-chart-4 transition-all duration-300"
                style={{ width: `${systems.warpCore.efficiency}%` }}
              />
            </div>
          </div>
        </div>

        {/* Shields */}
        <div className="flex items-center gap-2" data-testid="system-shields">
          <Shield className={`h-4 w-4 ${getStatusColor(systems.shields.status)}`} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs">Shields</span>
              <span className="text-xs text-muted-foreground">{systems.shields.strength}%</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-chart-2 transition-all duration-300"
                style={{ width: `${systems.shields.strength}%` }}
              />
            </div>
          </div>
        </div>

        {/* Weapons */}
        <div className="flex items-center gap-2" data-testid="system-weapons">
          <Crosshair className={`h-4 w-4 ${getStatusColor(systems.weapons.status)}`} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs">Weapons</span>
              <span className={`text-xs ${systems.weapons.ready ? 'text-chart-4' : 'text-muted-foreground'}`}>
                {systems.weapons.ready ? 'Ready' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Sensors */}
        <div className="flex items-center gap-2" data-testid="system-sensors">
          <Radio className={`h-4 w-4 ${getStatusColor(systems.sensors.status)}`} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs">Sensors</span>
              <span className="text-xs text-muted-foreground">{systems.sensors.range} LY</span>
            </div>
          </div>
        </div>

        {/* Life Support */}
        <div className="flex items-center gap-2" data-testid="system-lifesupport">
          <Activity className={`h-4 w-4 ${getStatusColor(systems.lifesupport.status)}`} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs">Life Support</span>
              <span className={`text-xs ${systems.lifesupport.optimal ? 'text-chart-4' : 'text-chart-5'}`}>
                {systems.lifesupport.optimal ? 'Optimal' : 'Suboptimal'}
              </span>
            </div>
          </div>
        </div>

        {/* Impulse Engines */}
        <div className="flex items-center gap-2" data-testid="system-impulse">
          <Wind className={`h-4 w-4 ${getStatusColor(systems.impulse.status)}`} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs">Impulse</span>
              <span className="text-xs text-muted-foreground">{systems.impulse.power}%</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-chart-3 transition-all duration-300"
                style={{ width: `${systems.impulse.power}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
