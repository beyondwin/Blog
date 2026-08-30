import {
  copyPublicAnswerEvent,
  type PublicAnswerEvent,
  type PublicAnswerEventSink,
} from '../../application/ports/event-sink.js';

export class InMemoryRedactedEventSink implements PublicAnswerEventSink {
  readonly #events: PublicAnswerEvent[] = [];

  record(event: PublicAnswerEvent): void {
    this.#events.push(copyPublicAnswerEvent(event));
  }

  events(): readonly Readonly<PublicAnswerEvent>[] {
    return Object.freeze(this.#events.map((event) => Object.freeze({ ...event })));
  }
}
