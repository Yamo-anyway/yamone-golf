import { deviceCountry } from "../data/device-country";
import React, { useState } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WORLD_COUNTRY_CODES } from "../../shared/countries";
import { countryLabels } from "../../shared/country-labels";
import { countryName } from "../data/course-presentation";
import { Button, Field, IconButton, Txt, colors } from "./components";
import { Icon } from "./icons";
import { useSession } from "./session";
export function CountryPicker({
  value,
  onChange,
  disabled,
  allowAll = false,
  testID,
}: {
  value: string;
  onChange: (country: string) => void;
  disabled?: boolean;
  allowAll?: boolean;
  testID?: string;
}) {
  const { t, lang } = useSession();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const preferred = deviceCountry();
  const normalized = query.trim().toLocaleLowerCase(lang);
  const choices = WORLD_COUNTRY_CODES.filter((code) =>
    [code, countryLabels[code].ko, countryLabels[code].en].some((s) =>
      s.toLocaleLowerCase(lang).includes(normalized),
    ),
  ).sort((a, b) =>
    a === preferred
      ? -1
      : b === preferred
        ? 1
        : countryName(a, lang).localeCompare(countryName(b, lang), lang),
  );
  const items = allowAll && !normalized ? ["", ...choices] : choices;
  return (
    <View style={{ gap: 8 }}>
      <Txt style={{ fontSize: 14, fontWeight: "600" }}>
        {t(allowAll ? "countryFilter" : "courseCountry")}
      </Txt>
      <Button
        label={
          value
            ? countryName(value, lang)
            : t(allowAll ? "allCountries" : "selectCountry")
        }
        secondary
        iconName="globe"
        disabled={disabled}
        testID={testID}
        onPress={() => {
          setQuery("");
          setOpen(true);
        }}
      />
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
          <View
            style={{ flex: 1, padding: 20, gap: 16 }}
            accessibilityViewIsModal
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <IconButton
                label={t("close")}
                iconName="close"
                secondary
                onPress={() => setOpen(false)}
              />
              <Txt
                accessibilityRole="header"
                style={{ fontSize: 23, fontWeight: "800", flex: 1 }}
              >
                {t("selectCountry")}
              </Txt>
            </View>
            <Field
              label={t("countrySearch")}
              value={query}
              onChangeText={setQuery}
              leadingIcon="search"
              testID="country-search"
              autoCorrect={false}
            />
            <FlatList
              data={items}
              keyExtractor={(code) => code || "all"}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Txt>{t("countryNotFound")}</Txt>}
              renderItem={({ item: code }) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel={
                    code ? countryName(code, lang) : t("allCountries")
                  }
                  accessibilityState={{ checked: value === code }}
                  aria-checked={value === code}
                  testID={"country-option-" + (code || "all")}
                  onPress={() => {
                    onChange(code);
                    setOpen(false);
                  }}
                  style={({ pressed }) => ({
                    minHeight: 52,
                    padding: 14,
                    borderRadius: 12,
                    marginBottom: 6,
                    backgroundColor:
                      code === value || pressed ? colors.mint : colors.white,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  })}
                >
                  <Txt style={{ flex: 1 }}>
                    {code ? countryName(code, lang) : t("allCountries")}
                  </Txt>
                  {!!code && (
                    <Txt style={{ fontSize: 13, color: colors.muted }}>
                      {code}
                    </Txt>
                  )}
                  {code === value && <Icon name="check" size={20} />}
                </Pressable>
              )}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
