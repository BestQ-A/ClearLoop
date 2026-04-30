import React, { type FunctionComponent } from "react";
import { Plus } from "lucide-react";

import { type FilePath } from "../../types/Homepage";
import { twMerge } from "tailwind-merge";
import { FormButton, Input } from "../ui/formFields/FormFields";
import { useI18n } from "../../i18n/I18nContext";

interface InputContainerProps {
  fileModalOpen: boolean;
  selectedFile: FilePath | null;
  input: string;
  onFileModalToggle: () => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSend: () => void;
  className?: string;
  searchTerm: string;
  onSearch: (value: string) => void;
}

const InputContainer: FunctionComponent<InputContainerProps> = ({
  fileModalOpen,
  selectedFile,
  input,
  onFileModalToggle,
  onInputChange,
  onSend,
  className,
  searchTerm,
  onSearch,
}) => {
  const { t } = useI18n();
  return (
    <div
      className={twMerge(
        "flex flex-col gap-2 mt-auto bg-[var(--vscode-input-background)] px-2 py-2 rounded-md items-start",
        className
      )}
    >
      <div>
        {fileModalOpen ? (
          <Input
            value={searchTerm}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t.searchFile}
            className="mb-2"
          />
        ) : selectedFile ? (
          <Input
            value={selectedFile.name}
            onClick={onFileModalToggle}
            readOnly
            className="cursor-pointer"
          />
        ) : (
          <FormButton onClick={onFileModalToggle}>
            <Plus size={16} />
          </FormButton>
        )}
      </div>
      <div className="flex gap-2 items-center w-full">
        <div className="flex-1">
          <Input
            value={input}
            onChange={onInputChange}
            placeholder={t.describeTask}
          />
        </div>
        <FormButton onClick={onSend}>{t.btnSend}</FormButton>
      </div>
    </div>
  );
};

export default InputContainer;
