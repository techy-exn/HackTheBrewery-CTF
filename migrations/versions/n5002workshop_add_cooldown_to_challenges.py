"""Add cooldown column to challenges

Number of seconds a student must wait between submissions on a challenge.
Used to stop rapid guessing on multiple-choice questions. 0 disables it.

Revision ID: n5002workshop
Revises: n5001workshop
Create Date: 2026-09-09
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "n5002workshop"
down_revision = "n5001workshop"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "challenges",
        sa.Column("cooldown", sa.Integer(), nullable=True, server_default="0"),
    )


def downgrade():
    op.drop_column("challenges", "cooldown")
