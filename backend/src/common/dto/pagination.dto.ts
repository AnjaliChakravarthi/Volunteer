import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size: number = 20;

  get skip(): number {
    return (this.page - 1) * this.page_size;
  }

  get take(): number {
    return this.page_size;
  }
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export function paginate<T>(
  data: T[],
  total: number,
  dto: PaginationDto,
): PaginatedResponse<T> {
  return {
    data,
    meta: {
      page: dto.page,
      page_size: dto.page_size,
      total,
      total_pages: Math.ceil(total / dto.page_size),
    },
  };
}
