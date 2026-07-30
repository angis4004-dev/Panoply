'use client';

export interface DeployEngineControls {
  marketVolatility: number;
  capitalConcentration: number;
  executionSpread: number;
  liquidityVel: number;
  riskTolerance: number;
  orbitSpeed: number;
  hudOpacity: number;
  brandAccent: string;
}

interface ConfigSidebarProps {
  values: DeployEngineControls;
  onChange: <K extends keyof DeployEngineControls>(key: K, value: DeployEngineControls[K]) => void;
}

function InputGroup({
  label,
  value,
  displayValue,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.05em] text-white/50">
          {label}
        </span>
        <span className="font-mono text-[10px] font-medium text-white/80 tabular-nums">
          {displayValue}
        </span>
      </div>
      <input
        type="range"
        className="de-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  );
}

/**
 * The "instrument cluster" control panel. Sliders write straight into the
 * Three.js scene's shader/rotation uniforms via the parent's onChange
 * callback (see DeployEngineHero) - React state here only exists so the
 * numeric readouts re-render; the scene itself is mutated imperatively,
 * not re-created, on every change.
 */
export function ConfigSidebar({ values, onChange }: ConfigSidebarProps) {
  return (
    <div
      className="pointer-events-auto w-[240px] rounded-lg border border-white/[0.12] p-4"
      style={{
        background: 'rgba(13, 19, 28, 0.55)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.05em] text-white/70">
          Config
        </span>
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          <span className="font-mono text-[10px] text-white/50">SYNCED</span>
        </span>
      </div>

      <div className="flex flex-col gap-4">
        <InputGroup
          label="Market Volatility"
          value={values.marketVolatility}
          displayValue={values.marketVolatility.toFixed(2)}
          min={0}
          max={2}
          step={0.01}
          onChange={(v) => onChange('marketVolatility', v)}
        />
        <InputGroup
          label="Capital Concentration"
          value={values.capitalConcentration}
          displayValue={values.capitalConcentration.toFixed(2)}
          min={0.1}
          max={2}
          step={0.01}
          onChange={(v) => onChange('capitalConcentration', v)}
        />
        <InputGroup
          label="Execution Spread"
          value={values.executionSpread}
          displayValue={values.executionSpread.toFixed(2)}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onChange('executionSpread', v)}
        />

        <div className="grid grid-cols-2 gap-3">
          <InputGroup
            label="Liquidity Vel."
            value={values.liquidityVel}
            displayValue={values.liquidityVel.toFixed(1)}
            min={0}
            max={2}
            step={0.1}
            onChange={(v) => onChange('liquidityVel', v)}
          />
          <InputGroup
            label="Risk Tolerance"
            value={values.riskTolerance}
            displayValue={values.riskTolerance.toFixed(1)}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => onChange('riskTolerance', v)}
          />
        </div>

        <div className="border-t border-white/10 pt-3">
          <p className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.05em] text-white/50">
            Market Tracker
          </p>
          <div className="grid grid-cols-2 gap-3">
            <InputGroup
              label="Orbit Speed"
              value={values.orbitSpeed}
              displayValue={values.orbitSpeed.toFixed(1)}
              min={0}
              max={2}
              step={0.1}
              onChange={(v) => onChange('orbitSpeed', v)}
            />
            <InputGroup
              label="HUD Opacity"
              value={values.hudOpacity}
              displayValue={values.hudOpacity.toFixed(1)}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => onChange('hudOpacity', v)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 pt-3">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.05em] text-white/50">
            Brand Accent
          </span>
          <input
            type="color"
            className="de-color-swatch"
            value={values.brandAccent}
            onChange={(e) => onChange('brandAccent', e.target.value)}
            aria-label="Brand accent color"
          />
        </div>
      </div>
    </div>
  );
}
