import { logger } from "./logging.js";

/**
 * Tiny in-process task runner (the *arr "System > Tasks" model): each task has an interval,
 * never overlaps itself, records last run/duration/result, and can be run on demand.
 */
export interface TaskInfo {
  id: string;
  name: string;
  intervalMs: number;
  lastStartedAt: string | null;
  lastDurationMs: number | null;
  lastResult: "ok" | "failed" | null;
  lastMessage: string | null;
  nextRunAt: string | null;
  running: boolean;
}

interface Task extends TaskInfo {
  fn: () => Promise<string | void>;
  timer?: NodeJS.Timeout;
}

const tasks = new Map<string, Task>();
const log = logger("tasks");

export function registerTask(id: string, name: string, intervalMs: number, fn: () => Promise<string | void>, firstRunDelayMs = 5_000): void {
  const t: Task = {
    id,
    name,
    intervalMs,
    fn,
    lastStartedAt: null,
    lastDurationMs: null,
    lastResult: null,
    lastMessage: null,
    nextRunAt: null,
    running: false,
  };
  tasks.set(id, t);
  schedule(t, firstRunDelayMs);
}

function schedule(t: Task, delay: number) {
  clearTimeout(t.timer);
  t.nextRunAt = new Date(Date.now() + delay).toISOString();
  t.timer = setTimeout(() => void runTask(t.id), delay);
  t.timer.unref?.();
}

export async function runTask(id: string): Promise<TaskInfo | null> {
  const t = tasks.get(id);
  if (!t) return null;
  if (t.running) return info(t);
  t.running = true;
  const start = Date.now();
  t.lastStartedAt = new Date(start).toISOString();
  try {
    const msg = await t.fn();
    t.lastResult = "ok";
    t.lastMessage = msg || null;
    log.debug({ task: id, ms: Date.now() - start }, "task finished");
  } catch (e) {
    t.lastResult = "failed";
    t.lastMessage = (e as Error).message;
    log.error({ task: id, err: e }, "task failed");
  } finally {
    t.running = false;
    t.lastDurationMs = Date.now() - start;
    schedule(t, t.intervalMs);
  }
  return info(t);
}

const info = ({ fn: _fn, timer: _timer, ...rest }: Task): TaskInfo => ({ ...rest });

export function listTasks(): TaskInfo[] {
  return [...tasks.values()].map(info);
}

export function stopAllTasks(): void {
  for (const t of tasks.values()) clearTimeout(t.timer);
}

/** Test helper. */
export function clearTasks(): void {
  stopAllTasks();
  tasks.clear();
}
