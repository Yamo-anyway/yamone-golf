import { Shell } from "../ui/screens";
import { NewRoundScreen } from "../ui/rounds";
export default function Screen() {
  return (
    <Shell scroll={false}>
      <NewRoundScreen />
    </Shell>
  );
}
