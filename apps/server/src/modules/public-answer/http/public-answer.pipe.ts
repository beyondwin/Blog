import { Injectable, type PipeTransform } from '@nestjs/common';
import { publicAskRequestSchema, type PublicAskRequest } from '@beyondwin/contracts/public-answer';

import { HttpBoundaryError } from '../../../http/bounded-error.filter.js';

@Injectable()
export class PublicAnswerPipe implements PipeTransform<unknown, PublicAskRequest> {
  transform(value: unknown): PublicAskRequest {
    const parsed = publicAskRequestSchema.safeParse(value);
    if (!parsed.success) throw new HttpBoundaryError(422, 'public answer request is invalid');
    return parsed.data;
  }
}
