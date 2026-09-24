import React, { useState } from "react";
import { adMode, showAdPrivacyOptions } from "../data/mobile-ads";
import { Button, Card, Txt } from "./components";
import { useTask } from "./golf-hooks";
import { useSession } from "./session";
export function AdPrivacy() {
  const { t } = useSession(),
    task = useTask();
  const [notRequired, setNotRequired] = useState(false);
  if (adMode !== "admob-test") return null;
  return (
    <Card>
      <Button
        label={t("adPrivacy")}
        secondary
        busy={task.busy}
        onPress={() =>
          void task.run(async () => {
            setNotRequired(!(await showAdPrivacyOptions()));
          })
        }
      />
      {notRequired && <Txt>{t("adPrivacyNotRequired")}</Txt>}
      {!!task.errorText && <Txt>{task.errorText}</Txt>}
    </Card>
  );
}
