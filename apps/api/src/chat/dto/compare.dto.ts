import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Matches,
} from "class-validator";

/**
 * POST /compare body (STOCK-07). The `@Matches(/^[A-Z0-9.]+$/)` per-element
 * fence (T-07-23) rejects anything but uppercase alphanumerics + dot — no
 * quotes, spaces, or control chars can reach the Gemini prompt, closing the
 * prompt-injection vector. `ValidationPipe({ whitelist: true })` strips any
 * unknown fields.
 */
export class CompareDto {
  @IsArray()
  @ArrayMinSize(2, { message: "Compare 2 or 3 instruments at a time." })
  @ArrayMaxSize(3, { message: "Compare 2 or 3 instruments at a time." })
  @IsString({ each: true })
  @Matches(/^[A-Z0-9.]+$/, {
    each: true,
    message: "Symbols must be NSE/BSE format.",
  })
  symbols!: string[];
}
