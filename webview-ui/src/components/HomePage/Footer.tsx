import { memo } from "react";
import { User, Globe } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { FormButton } from "../ui/formFields/FormFields";
import { useI18n } from "../../i18n/I18nContext";

export interface Profile {
  avatar_url: string;
  email: string;
  username: string;
  accessToken?: string;
}

interface FooterProps {
  className?: string;
  profile?: Profile | null;
  onSignIn: () => void;
}

const Footer: React.FC<FooterProps> = ({ className, profile, onSignIn }) => {
  const { t, locale, setLocale } = useI18n();
  return (
    <footer
      className={twMerge(
        "flex items-center justify-between rounded-md text-sm font-medium shadow-md mt-4 px-2 py-2",
        className
      )}
      style={{
        color: "var(--vscode-input-foreground)",
      }}
    >
      <div className="flex items-center justify-between gap-2 w-full">
        <div className="flex items-center justify-center gap-2">
          <FormButton onClick={onSignIn}>
            {profile ? (
              <div className="flex items-center gap-2">
                <img
                  alt="User Avatar"
                  className="w-6 h-6 rounded-full"
                  src={profile.avatar_url}
                />
                <div className="text-[var(--vscode-input-foreground)]">
                  @{profile.username}
                </div>
              </div>
            ) : (
              <User size={16} />
            )}
          </FormButton>
        </div>
        <div className="flex items-center gap-1">
          <Globe size={14} className="opacity-70" />
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as "en" | "zh")}
            className="bg-transparent text-[var(--vscode-input-foreground)] border-none outline-none text-xs cursor-pointer opacity-80 hover:opacity-100"
          >
            <option value="zh">{t.langZh}</option>
            <option value="en">{t.langEn}</option>
          </select>
        </div>
      </div>
    </footer>
  );
};

export default memo(Footer);
