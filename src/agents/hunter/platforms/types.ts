// ============================================
// Ultron AI — Hunter Platform Sub-Agent Types
// ============================================

import { JobMatch } from '../../../types';

export interface JobPlatformSubAgent {
  name: string;
  search(query?: string): Promise<JobMatch[]>;
}
