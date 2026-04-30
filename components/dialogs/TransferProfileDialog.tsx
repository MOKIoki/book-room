"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TransferProfileDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 名前 + 合言葉で引き継ぎを実行する。
  // 戻り値 true: 成功 (= フォームをリセットしてダイアログを閉じる)
  // 戻り値 false: 失敗 (= 入力に戻し、再入力可能にする。alert は親で表示済)
  onTransfer: (name: string, passphrase: string) => Promise<boolean>;
};

export default function TransferProfileDialog({
  open,
  onOpenChange,
  onTransfer,
}: TransferProfileDialogProps) {
  const [step, setStep] = useState<"input" | "confirm">("input");
  const [name, setName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep("input");
    setName("");
    setPassphrase("");
    setSubmitting(false);
  };

  const handleProceed = () => {
    if (!name.trim()) {
      alert("名前を入力してください");
      return;
    }
    if (!passphrase.trim()) {
      alert("合言葉を入力してください");
      return;
    }
    setStep("confirm");
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    const ok = await onTransfer(name.trim(), passphrase.trim());
    setSubmitting(false);
    if (ok) {
      reset();
      onOpenChange(false);
    } else {
      // 失敗時は input 段階に戻して再入力可能にする
      setStep("input");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>別端末からプロフィールを引き継ぐ</DialogTitle>
        </DialogHeader>

        {step === "input" && (
          <>
            <p className="text-sm leading-6 text-neutral-500">
              もとの端末で設定した名前と合言葉が一致した場合のみ、このブラウザに引き継げます。
            </p>

            <div className="space-y-2">
              <Label htmlFor="transfer-name">名前</Label>
              <Input
                id="transfer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="もとの端末で使っていた表示名"
                className="rounded-2xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="transfer-passphrase">合言葉</Label>
              <Input
                id="transfer-passphrase"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="もとの端末で設定した合言葉"
                className="rounded-2xl"
              />
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs leading-5 text-amber-800">
              引き継ぐと、もとの端末ではこのプロフィールを使えなくなります。
              もとの端末で再び使う場合は、同じ名前と合言葉で改めて引き継いでください。
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => onOpenChange(false)}
              >
                閉じる
              </Button>
              <Button className="rounded-2xl" onClick={handleProceed}>
                引き継ぐ
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "confirm" && (
          <>
            <p className="text-sm leading-6">
              「<span className="font-medium">{name.trim()}</span>」 をこのブラウザに引き継ぎます。
            </p>
            <p className="text-sm leading-6 text-neutral-600">
              もとの端末ではこのプロフィールを使えなくなります。引き継ぎますか?
            </p>

            <DialogFooter>
              <Button
                variant="outline"
                className="rounded-2xl"
                disabled={submitting}
                onClick={() => setStep("input")}
              >
                キャンセル
              </Button>
              <Button
                className="rounded-2xl"
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? "引き継ぎ中..." : "引き継ぐ"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
