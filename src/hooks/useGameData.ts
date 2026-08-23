import { useContext } from "react";
import { GameDataContext } from "../contexts/gameDataContextObject";

export function useGameData() {
  const data = useContext(GameDataContext);
  if (!data) throw new Error("useGameData must be used within GameDataProvider");
  return data;
}
