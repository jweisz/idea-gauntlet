"""sync_agents_from_presets: reconciling `agents` with app/agents/presets/*.md
on every boot (add / update / remove), including the FK-guarded skip when a
boss to be removed still has game history referencing it.
"""

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.models.db import Base
from app.models.schema import Agent, BattleBoss, GauntletSession
from app.services import seed as seed_module


def _session_factory(tmp_path, name="sync.db", enforce_fk=False):
    engine = create_engine(
        f"sqlite:///{tmp_path / name}", connect_args={"check_same_thread": False}
    )
    if enforce_fk:

        @event.listens_for(engine, "connect")
        def _fk_on(dbapi_conn, _record):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    Base.metadata.create_all(bind=engine)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _preset(name, emoji="🤖", system_prompt="prompt"):
    return {
        "name": name,
        "emoji": emoji,
        "role_description": f"{name} role",
        "relevance_instructions": "",
        "system_prompt": system_prompt,
        "filename": f"{name}.md",
    }


def test_adds_new_agent_from_preset(monkeypatch, tmp_path):
    Session = _session_factory(tmp_path)
    monkeypatch.setattr(seed_module, "SessionLocal", Session)
    monkeypatch.setattr(
        seed_module.prompt_loader, "list_prompts", lambda: [_preset("Nemesis")]
    )

    seed_module.sync_agents_from_presets()

    with Session() as db:
        assert [a.name for a in db.query(Agent).all()] == ["Nemesis"]


def test_updates_existing_agent_content(monkeypatch, tmp_path):
    Session = _session_factory(tmp_path)
    monkeypatch.setattr(seed_module, "SessionLocal", Session)
    with Session() as db:
        db.add(
            Agent(
                name="Nemesis",
                emoji="👺",
                role_description="old",
                system_prompt="old prompt",
                sort_order=1,
            )
        )
        db.commit()

    monkeypatch.setattr(
        seed_module.prompt_loader,
        "list_prompts",
        lambda: [_preset("Nemesis", emoji="🔥", system_prompt="new prompt")],
    )
    seed_module.sync_agents_from_presets()

    with Session() as db:
        agent = db.query(Agent).filter_by(name="Nemesis").one()
        assert agent.emoji == "🔥"
        assert agent.system_prompt == "new prompt"


def test_removes_agent_whose_preset_is_gone(monkeypatch, tmp_path):
    Session = _session_factory(tmp_path)
    monkeypatch.setattr(seed_module, "SessionLocal", Session)
    with Session() as db:
        db.add(
            Agent(
                name="Retired",
                emoji="👻",
                role_description="r",
                system_prompt="p",
                sort_order=1,
            )
        )
        db.commit()

    monkeypatch.setattr(
        seed_module.prompt_loader, "list_prompts", lambda: [_preset("Nemesis")]
    )
    seed_module.sync_agents_from_presets()

    with Session() as db:
        assert {a.name for a in db.query(Agent).all()} == {"Nemesis"}


def test_keeps_agent_with_game_history_instead_of_deleting(monkeypatch, tmp_path):
    Session = _session_factory(tmp_path, enforce_fk=True)
    monkeypatch.setattr(seed_module, "SessionLocal", Session)
    with Session() as db:
        agent = Agent(
            name="Retired",
            emoji="👻",
            role_description="r",
            system_prompt="p",
            sort_order=1,
        )
        db.add(agent)
        db.commit()
        db.refresh(agent)

        session = GauntletSession(user_id="u1", idea="an idea", agent_ids="[]")
        db.add(session)
        db.commit()
        db.refresh(session)

        db.add(BattleBoss(session_id=session.id, agent_id=agent.id))
        db.commit()

    monkeypatch.setattr(
        seed_module.prompt_loader, "list_prompts", lambda: [_preset("Nemesis")]
    )
    seed_module.sync_agents_from_presets()

    with Session() as db:
        names = {a.name for a in db.query(Agent).all()}
        # Kept despite its preset being gone, since deleting it would orphan
        # the BattleBoss row's foreign key.
        assert "Retired" in names
        assert "Nemesis" in names
