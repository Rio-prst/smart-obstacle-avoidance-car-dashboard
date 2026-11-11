import { BadRequestException } from '@nestjs/common';

export const MAX_EXPORT_RANGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
export const DEFAULT_EXPORT_RANGE_MS = 24 * 60 * 60 * 1000; // 24 hours in ms
export const EXPORT_BATCH_SIZE = 5000;

export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    return `"${json.replace(/"/g, '""')}"`;
  }

  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function parseAndValidateRange(
  from?: string,
  to?: string,
): { fromDate: Date; toDate: Date } {
  let toDate: Date;
  let fromDate: Date;

  if (to !== undefined && to !== '') {
    toDate = new Date(to);
    if (Number.isNaN(toDate.getTime())) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'to must be a valid ISO 8601 date string',
        details: [{ field: 'to', issue: 'invalid date' }],
      });
    }
  } else {
    toDate = new Date();
  }

  if (from !== undefined && from !== '') {
    fromDate = new Date(from);
    if (Number.isNaN(fromDate.getTime())) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'from must be a valid ISO 8601 date string',
        details: [{ field: 'from', issue: 'invalid date' }],
      });
    }
  } else {
    fromDate = new Date(toDate.getTime() - DEFAULT_EXPORT_RANGE_MS);
  }

  if (fromDate.getTime() > toDate.getTime()) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'from date cannot be after to date',
      details: [{ field: 'from', issue: 'from > to' }],
    });
  }

  const diffMs = toDate.getTime() - fromDate.getTime();
  if (diffMs > MAX_EXPORT_RANGE_MS) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Date range cannot exceed 7 days',
      details: [{ field: 'range', issue: 'max 7 days allowed' }],
    });
  }

  return { fromDate, toDate };
}
