import { copyRedactedPublicAnswerEvent, type RedactedPublicAnswerEvent } from '../telemetry/redacted-events.js';

export class InMemoryRedactedEventSink {
  readonly #events: RedactedPublicAnswerEvent[] = [];

  async record(event: RedactedPublicAnswerEvent): Promise<void> {
    this.#events.push(copyRedactedPublicAnswerEvent(event));
  }

  events(): readonly Readonly<RedactedPublicAnswerEvent>[] {
    return Object.freeze(this.#events.map((event) => Object.freeze({ ...event })));
  }
}
