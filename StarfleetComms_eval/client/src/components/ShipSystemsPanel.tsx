import { Shield, Zap, Activity, Radio, Wind, Crosshair } from "lucide-react";
import { ShipSystemStatus } from "@shared/schema";

interface ShipSystemsPanelProps {
  systems: ShipSystemStatus;
}

export function ShipSystemsPanel({ systems }: ShipSystemsPanelProps) {
  const systemItems = [
    {
      icon: Zap,
      label: "WARP CORE",
      value: `${systems.warpCore.efficiency}%`,
      barValue: systems.warpCore.efficiency,
      barColor: 'var(--lcars-orange)',
      status: systems.warpCore.status,
    },
    {
      icon: Shield,
      label: "SHIELDS",
      value: `${systems.shields.strength}%`,
      barValue: systems.shields.strength,
      barColor: 'var(--lcars-blue)',
      status: systems.shields.status,
    },
    {
      icon: Crosshair,
      label: "WEAPONS",
      value: systems.weapons.ready ? 'READY' : 'OFFLINE',
      barValue: null,
      barColor: null,
      status: systems.weapons.status,
    },
    {
      icon: Radio,
      label: "SENSORS",
      value: `${systems.sensors.range} LY`,
      barValue: null,
      barColor: null,
      status: systems.sensors.status,
    },
    {
      icon: Activity,
      label: "LIFE SUPPORT",
      value: systems.lifesupport.optimal ? 'OPTIMAL' : 'SUBOPTIMAL',
      barValue: null,
      barColor: null,
      status: systems.lifesupport.status,
    },
    {
      icon: Wind,
      label: "IMPULSE",
      value: `${systems.impulse.power}%`,
      barValue: systems.impulse.power,
      barColor: 'var(--lcars-purple)',
      status: systems.impulse.status,
    },
  ];

  return (
    <div className="rounded-lg p-4 space-y-3" style={{ border: '2px solid var(--lcars-orange)', backgroundColor: 'rgba(255, 153, 0, 0.05)' }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--lcars-orange)' }}>
          SHIP SYSTEMS
        </h3>
        <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--lcars-blue)' }}>
          USS Enterprise NCC-1701-D
        </span>
      </div>

      <div className="space-y-3">
        {systemItems.map((item) => {
          const Icon = item.icon;
          const statusColor = item.status === 'Online' ? 'var(--lcars-orange)' :
                              item.status === 'Warning' ? 'var(--lcars-red)' : 'var(--lcars-blue)';
          const valueColor = item.value === 'READY' || item.value === 'OPTIMAL' ? '#00cc00' : statusColor;

          return (
            <div key={item.label} className="flex items-center gap-3">
              <Icon className="h-4 w-4 flex-shrink-0" style={{ color: statusColor }} />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tracking-wider" style={{ color: 'var(--lcars-orange)' }}>
                    {item.label}
                  </span>
                  <span className="text-xs font-bold" style={{ color: valueColor }}>
                    {item.value}
                  </span>
                </div>
                {item.barValue !== null && item.barColor && (
                  <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ backgroundColor: '#333' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${item.barValue}%`, backgroundColor: item.barColor }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
