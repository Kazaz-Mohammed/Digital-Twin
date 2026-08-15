export interface PumpTelemetry {
  power_kw: number;
  voltage_v: number;
  current_a: number;
  speed_rpm: number;
  temperature_c: number;
  pressure_bar: number;
  bearing_wear: boolean;
}

export interface SimStatus {
  timestamp: string;
  // Tank & General Sensors
  tank_max_capacity: number;
  tank_level: number;
  lit001_pct: number;
  pit001_pressure: number;
  fit001_flow: number;
  
  // Controls & Targets
  pmp001_speed: number;
  pmp002_speed: number;
  v001_open: boolean;
  
  // Pumps
  pmp001: PumpTelemetry;
  pmp002: PumpTelemetry;
  
  // Alarm limits
  lah_limit: number;
  lal_limit: number;
  pmp_nominal_voltage: number;
  pmp_nominal_power: number;
  pmp_max_rpm: number;
  ambient_temp: number;
  
  // Trip states
  interlock_tripped: boolean;
  active_alarms: string[];
  
  // Logging parameters
  logging_active: boolean;
  pmp001_log_size: number;
  pmp002_log_size: number;
  pmp001_log_line_count: number;
  pmp002_log_line_count: number;
}
