/** The animation clock always advances; the combat clock can be globally paused. */
export type ClockDomain = "combat" | "animation";
export interface ClockState {
  combat: number;
  animation: number;
}
export interface ClockEvent {
  clock: ClockDomain;
  time: number;
  priority: number;
  sequence: number;
  run: () => void;
}

function less(a: ClockEvent, b: ClockEvent) {
  return (
    a.time < b.time ||
    (a.time === b.time &&
      (a.priority < b.priority ||
        (a.priority === b.priority && a.sequence < b.sequence)))
  );
}
class EventHeap {
  private heap: ClockEvent[] = [];
  peek() {
    return this.heap[0];
  }
  nextAfter(after?: number): number | undefined {
    if (after === undefined || this.heap[0]?.time > after)
      return this.heap[0]?.time;
    let next = Infinity;
    for (const event of this.heap)
      if (event.time > after) next = Math.min(next, event.time);
    return Number.isFinite(next) ? next : undefined;
  }
  push(event: ClockEvent) {
    const heap = this.heap;
    heap.push(event);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!less(heap[index], heap[parent])) break;
      [heap[index], heap[parent]] = [heap[parent], heap[index]];
      index = parent;
    }
  }
  pop() {
    const heap = this.heap,
      first = heap[0],
      last = heap.pop();
    if (heap.length && last) {
      heap[0] = last;
      let index = 0;
      while (true) {
        let next = index;
        const left = 2 * index + 1,
          right = left + 1;
        if (left < heap.length && less(heap[left], heap[next])) next = left;
        if (right < heap.length && less(heap[right], heap[next])) next = right;
        if (next === index) break;
        [heap[index], heap[next]] = [heap[next], heap[index]];
        index = next;
      }
    }
    return first;
  }
}

/** Two heaps avoid rescanning every queued hit whenever a pause starts or ends. */
export class DualClockQueue {
  private combat = new EventHeap();
  private animation = new EventHeap();
  push(event: ClockEvent) {
    this[event.clock].push(event);
  }
  nextTime(clock: ClockDomain, after?: number): number | undefined {
    return this[clock].nextAfter(after);
  }
  pop(
    state: ClockState,
    paused: boolean,
  ): { event: ClockEvent; at: ClockState } | undefined {
    const combat = this.combat.peek(),
      animation = this.animation.peek();
    const combatDelta = !combat
      ? Infinity
      : paused && combat.time > state.combat
        ? Infinity
        : Math.max(0, combat.time - state.combat);
    const animationDelta = animation
      ? Math.max(0, animation.time - state.animation)
      : Infinity;
    if (!Number.isFinite(Math.min(combatDelta, animationDelta)))
      return undefined;
    let domain: ClockDomain;
    if (combatDelta < animationDelta) domain = "combat";
    else if (animationDelta < combatDelta) domain = "animation";
    else
      domain =
        combat &&
        animation &&
        (combat.priority < animation.priority ||
          (combat.priority === animation.priority &&
            combat.sequence < animation.sequence))
          ? "combat"
          : "animation";
    const delta = domain === "combat" ? combatDelta : animationDelta;
    return {
      event: this[domain].pop()!,
      at: {
        combat: state.combat + (paused ? 0 : delta),
        animation: state.animation + delta,
      },
    };
  }
}
