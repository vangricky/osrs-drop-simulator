import { createContext } from "react";
import type { GameData } from "../data/loadGameData";

export const GameDataContext = createContext<GameData | null>(null);
