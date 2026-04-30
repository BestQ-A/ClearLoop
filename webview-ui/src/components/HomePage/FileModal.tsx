import React, { type FunctionComponent } from "react";
import { type FilePath } from "../../types/Homepage";
import { twMerge } from "tailwind-merge";
import Modal from "../ui/modal/Modal";
import { ListFiles } from "./ListFiles";
import { useI18n } from "../../i18n/I18nContext";

interface FileModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FilePath[];
  onSelectFile: (file: FilePath) => void;
  className?: string;
}

const FileModal: FunctionComponent<FileModalProps> = ({
  isOpen,
  onClose,
  files,
  onSelectFile,
  className,
}) => {
  const { t } = useI18n();
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className={twMerge(
        "absolute bottom-28 w-3/4 max-h-[30vh] flex flex-col gap-2 z-50 bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)] rounded-md shadow-lg border border-[var(--vscode-input-border)]",
        className
      )}
    >
      <ul className="space-y-2 p-2 overflow-y-auto">
        {files.length > 0 ? (
          files.map((file, index) => (
            <ListFiles
              key={index}
              file={file}
              index={index}
              handleSelectFile={onSelectFile}
            />
          ))
        ) : (
          <li className="p-2 text-[var(--vscode-foreground)] opacity-70">
            {t.noFilesFound}
          </li>
        )}
      </ul>
    </Modal>
  );
};

export default FileModal;
