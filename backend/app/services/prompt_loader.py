import yaml
from typing import List, Dict, Optional
from pathlib import Path


def _fallback_role_description(content: str, filename: str) -> str:
    first_paragraph = next(
        (block.strip() for block in content.split("\n\n") if block.strip()), ""
    )
    return first_paragraph or filename


class PromptLoader:
    def __init__(self, prompts_dir: Optional[str] = None):
        if prompts_dir:
            self.prompts_dir = Path(prompts_dir)
        else:
            # Look for app/agents/presets relative to this file
            base_dir = Path(__file__).resolve().parent.parent
            self.prompts_dir = base_dir / "agents" / "presets"

    def list_prompts(self) -> List[Dict]:
        prompts = []
        if not self.prompts_dir.exists():
            return prompts

        for file_path in self.prompts_dir.glob("*.md"):
            prompt_data = self._parse_md_file(file_path)
            if prompt_data:
                prompts.append(prompt_data)

        prompts.sort(key=lambda x: x["name"])
        return prompts

    def _parse_md_file(self, file_path: Path) -> Optional[Dict]:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            if content.startswith("---"):
                parts = content.split("---", 2)
                if len(parts) >= 3:
                    metadata = yaml.safe_load(parts[1])
                    description = parts[2].strip()
                    return {
                        "name": metadata.get("name", file_path.stem),
                        "emoji": metadata.get("emoji", "🤖"),
                        "role_description": metadata.get(
                            "role_description",
                            _fallback_role_description(description, file_path.stem),
                        ),
                        "relevance_instructions": metadata.get(
                            "relevance_instructions", ""
                        ),
                        "system_prompt": description,
                        "filename": file_path.name,
                    }

            # Fallback if no frontmatter
            return {
                "name": file_path.stem,
                "emoji": "🤖",
                "role_description": _fallback_role_description(
                    content.strip(), file_path.stem
                ),
                "relevance_instructions": "",
                "system_prompt": content.strip(),
                "filename": file_path.name,
            }
        except Exception as e:
            print(f"Error parsing {file_path}: {e}")
            return None


prompt_loader = PromptLoader()
