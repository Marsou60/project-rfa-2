from app.services.month_platform_coverage import annotate_platform_months, coverage_status


def test_un_mois_apres_la_couverture_nest_pas_un_zero():
    assert coverage_status(10, 9) == "pending"
    assert coverage_status(9, 9) == "known"
    assert coverage_status(8, None) == "known"


def test_le_statut_est_pose_sur_chaque_mois_de_plateforme():
    platforms = [
        {
            "platform": "EXADIS",
            "months": [
                {"month": 9, "current": 100.0, "previous": 80.0},
                {"month": 10, "current": 0.0, "previous": 90.0},
            ],
        },
        {
            "platform": "ACR",
            "months": [{"month": 10, "current": 50.0, "previous": 40.0}],
        },
    ]
    annotate_platform_months(platforms, {"EXADIS": 9, "ACR": 10})
    assert platforms[0]["months"][0]["status"] == "known"
    assert platforms[0]["months"][1]["status"] == "pending"
    assert platforms[1]["months"][0]["status"] == "known"
