-- 画像生成プロンプトテンプレートテーブル
CREATE TABLE IF NOT EXISTS image_prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  prompt_template TEXT NOT NULL,
  negative_prompt TEXT,
  style_category TEXT NOT NULL DEFAULT 'general'
    CHECK (style_category IN (
      'photorealistic', 'anime', 'watercolor', 'oil_painting',
      'sketch', 'pixel_art', '3d_render', 'flat_design',
      'cyberpunk', 'fantasy', 'general'
    )),
  default_model TEXT DEFAULT 'gemini-2.5-flash-image',
  default_aspect_ratio TEXT DEFAULT '16:9',
  default_image_size TEXT DEFAULT '1K',
  is_public BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE image_prompt_templates ENABLE ROW LEVEL SECURITY;

-- 公開テンプレートは全員閲覧可能、非公開はワークスペース内のみ
CREATE POLICY "templates_read" ON image_prompt_templates
  FOR SELECT USING (
    is_public = true
    OR workspace_id IN (SELECT get_my_workspace_ids())
  );

CREATE POLICY "templates_write" ON image_prompt_templates
  FOR ALL USING (
    workspace_id IN (SELECT get_my_workspace_ids())
  );

CREATE INDEX IF NOT EXISTS idx_image_templates_category ON image_prompt_templates(style_category);
CREATE INDEX IF NOT EXISTS idx_image_templates_workspace ON image_prompt_templates(workspace_id);

-- デフォルトテンプレート（公開、workspace_id = NULL）
INSERT INTO image_prompt_templates (name, description, prompt_template, style_category, is_public) VALUES
  ('フォトリアリスティック', 'プロ品質の写真風画像', '{{subject}}, photorealistic, ultra detailed, professional photography, natural lighting, 8K resolution', 'photorealistic', true),
  ('アニメスタイル', '日本のアニメ風イラスト', '{{subject}}, anime style, vibrant colors, detailed illustration, studio ghibli inspired, high quality anime art', 'anime', true),
  ('水彩画', '柔らかい水彩画タッチ', '{{subject}}, watercolor painting, soft colors, artistic brush strokes, delicate, dreamy atmosphere, fine art', 'watercolor', true),
  ('油絵', 'クラシックな油絵風', '{{subject}}, oil painting, rich colors, textured canvas, classical art style, masterful brushwork, museum quality', 'oil_painting', true),
  ('スケッチ', '鉛筆スケッチ風', '{{subject}}, pencil sketch, detailed line drawing, black and white, artistic, hand-drawn style, fine detail', 'sketch', true),
  ('ピクセルアート', 'レトロゲーム風', '{{subject}}, pixel art, 16-bit style, retro gaming aesthetic, clean pixels, vibrant palette', 'pixel_art', true),
  ('3Dレンダー', '3DCG風', '{{subject}}, 3D render, octane render, ray tracing, cinematic lighting, volumetric, photorealistic 3D', '3d_render', true),
  ('フラットデザイン', 'モダンなフラットスタイル', '{{subject}}, flat design, minimal, clean vector style, modern illustration, bold colors, geometric shapes', 'flat_design', true),
  ('サイバーパンク', '近未来サイバーパンク風', '{{subject}}, cyberpunk style, neon lights, futuristic, dark atmosphere, high tech low life, rain, holographic', 'cyberpunk', true),
  ('ファンタジー', 'ファンタジーアート', '{{subject}}, fantasy art, magical atmosphere, epic composition, dramatic lighting, mythical, enchanted', 'fantasy', true)
ON CONFLICT DO NOTHING;
