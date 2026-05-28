import RELIANCE from "./RELIANCE.json";
import HDFCBANK from "./HDFCBANK.json";
import INFY from "./INFY.json";
import ITC from "./ITC.json";
import MARUTI from "./MARUTI.json";
import SUNPHARMA from "./SUNPHARMA.json";
import type { ScoreStockInput } from "../../../types";

export const STOCK_FIXTURES: ReadonlyArray<{
  readonly name: string;
  readonly input: ScoreStockInput;
}> = [
  { name: "RELIANCE", input: RELIANCE as ScoreStockInput },
  { name: "HDFCBANK", input: HDFCBANK as ScoreStockInput },
  { name: "INFY", input: INFY as ScoreStockInput },
  { name: "ITC", input: ITC as ScoreStockInput },
  { name: "MARUTI", input: MARUTI as ScoreStockInput },
  { name: "SUNPHARMA", input: SUNPHARMA as ScoreStockInput },
];
