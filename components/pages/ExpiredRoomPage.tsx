"use client";

import React from "react";
import { ArrowLeft } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ExpiredRoomPageProps = {
  onBack: () => void;
};

export default function ExpiredRoomPage({
  onBack,
}: ExpiredRoomPageProps) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Button variant="ghost" className="mb-4 rounded-2xl" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          戻る
        </Button>

        <Card className="rounded-3xl border-0 shadow-sm">
          <CardHeader>
            <CardTitle>この部屋は終了しました</CardTitle>
            <CardDescription>
              期限切れのため、この部屋は現在表示対象外です。必要なら新しい部屋を作成してください。
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
