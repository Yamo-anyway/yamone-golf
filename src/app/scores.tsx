import { Shell } from "../ui/screens";
import { ScoresScreen } from "../ui/scores";
export default function Screen() {
  return (
    <Shell scroll={false}>
      <ScoresScreen />
    </Shell>
  );
}
