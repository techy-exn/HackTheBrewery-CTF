"""Add order_id column to challenges

Controls the display order of challenges in the user interface. Higher
values are shown first so the next activity appears at the top of the list.

Revision ID: n5001workshop
Revises: a49ad66aa0f1
Create Date: 2026-09-09
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "n5001workshop"
down_revision = "a49ad66aa0f1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "challenges",
        sa.Column("order_id", sa.Integer(), nullable=True, server_default="0"),
    )
    op.create_index(
        op.f("ix_challenges_order_id"), "challenges", ["order_id"], unique=False
    )
    # Seed existing rows so ordering is deterministic before any admin edits.
    op.execute("UPDATE challenges SET order_id = id WHERE order_id IS NULL")


def downgrade():
    op.drop_index(op.f("ix_challenges_order_id"), table_name="challenges")
    op.drop_column("challenges", "order_id")
