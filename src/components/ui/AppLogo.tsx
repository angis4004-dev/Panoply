import React from 'react';
import { AegisMark } from './AegisLogo';

export default function AppLogo({ size = 24 }: { size?: number }) {
  return <AegisMark size={size} />;
}
